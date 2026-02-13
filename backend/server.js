const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

const PORT = Number.parseInt(process.env.PORT || '4000', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret_in_production';
const SESSION_DAYS = Number.parseInt(process.env.SESSION_DAYS || '7', 10);
const SESSION_SECONDS = SESSION_DAYS * 24 * 60 * 60;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const ADMIN_USERNAMES = new Set(['pcatv']);
const FORUM_COOLDOWN_MS = 15000;

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const dbPath = path.join(dataDir, 'app.db');
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function callback(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(Array.isArray(rows) ? rows : []);
    });
  });
}

async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      chapter_number INTEGER NOT NULL,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS forum_messages (
      id TEXT PRIMARY KEY,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      username TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS reader_progress (
      username TEXT NOT NULL,
      chapter_number INTEGER NOT NULL,
      page INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (username, chapter_number)
    )
  `);
}

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function validateUsername(username) {
  if (username.length < 3 || username.length > 24) {
    return 'Le nom utilisateur doit faire entre 3 et 24 caracteres.';
  }
  if (!/^[a-z0-9._-]+$/i.test(username)) {
    return 'Le nom utilisateur contient des caracteres non autorises.';
  }
  return '';
}

function validatePassword(password) {
  if (password.length < 10) return 'Le mot de passe doit faire au moins 10 caracteres.';
  if (!/[A-Z]/.test(password)) return 'Ajoute au moins une lettre majuscule.';
  if (!/[a-z]/.test(password)) return 'Ajoute au moins une lettre minuscule.';
  if (!/[0-9]/.test(password)) return 'Ajoute au moins un chiffre.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Ajoute au moins un caractere special.';
  return '';
}

function issueToken(username) {
  return jwt.sign({ username }, JWT_SECRET, { expiresIn: `${SESSION_SECONDS}s` });
}

function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({ ok: false, message: 'Authentification requise.' });
    return;
  }
  const token = authHeader.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const username = normalizeUsername(payload.username);
    req.user = {
      username,
      isAdmin: ADMIN_USERNAMES.has(username)
    };
    next();
  } catch {
    res.status(401).json({ ok: false, message: 'Session invalide ou expiree.' });
  }
}

function adminRequired(req, res, next) {
  if (!req.user?.isAdmin) {
    res.status(403).json({ ok: false, message: 'Droits admin requis.' });
    return;
  }
  next();
}

const app = express();
app.use(helmet());
app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN, credentials: false }));
app.use(express.json({ limit: '512kb' }));

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(globalLimiter);

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'nine-peaks-backend' });
});

app.post('/api/auth/signup', authLimiter, async (req, res) => {
  try {
    const username = normalizeUsername(req.body?.username);
    const password = String(req.body?.password || '');
    const usernameError = validateUsername(username);
    if (usernameError) {
      res.status(400).json({ ok: false, message: usernameError });
      return;
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      res.status(400).json({ ok: false, message: passwordError });
      return;
    }
    const existing = await get('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) {
      res.status(409).json({ ok: false, message: 'Ce nom utilisateur existe deja.' });
      return;
    }
    const hash = await bcrypt.hash(password, 12);
    await run(
      'INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)',
      [username, hash, new Date().toISOString()]
    );
    res.json({ ok: true, message: 'Compte cree avec succes.' });
  } catch (error) {
    console.error('[api] signup error:', error);
    res.status(500).json({ ok: false, message: 'Erreur serveur.' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const username = normalizeUsername(req.body?.username);
    const password = String(req.body?.password || '');
    const user = await get('SELECT username, password_hash FROM users WHERE username = ?', [username]);
    if (!user) {
      res.status(404).json({ ok: false, message: 'Compte introuvable.' });
      return;
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      res.status(401).json({ ok: false, message: 'Mot de passe incorrect.' });
      return;
    }
    const token = issueToken(user.username);
    res.json({
      ok: true,
      message: 'Connexion reussie.',
      token,
      user: {
        username: user.username,
        isAdmin: ADMIN_USERNAMES.has(user.username)
      }
    });
  } catch (error) {
    console.error('[api] login error:', error);
    res.status(500).json({ ok: false, message: 'Erreur serveur.' });
  }
});

app.get('/api/auth/me', authRequired, (req, res) => {
  res.json({
    ok: true,
    user: {
      username: req.user.username,
      isAdmin: req.user.isAdmin
    }
  });
});

app.get('/api/comments/:chapter', async (req, res) => {
  try {
    const chapter = Number.parseInt(req.params.chapter, 10);
    if (Number.isNaN(chapter) || chapter < 1) {
      res.status(400).json({ ok: false, message: 'Chapitre invalide.' });
      return;
    }
    const rows = await all(
      'SELECT id, author, content, created_at AS createdAt FROM comments WHERE chapter_number = ? ORDER BY created_at DESC',
      [chapter]
    );
    res.json({ ok: true, comments: rows });
  } catch (error) {
    console.error('[api] comments list error:', error);
    res.status(500).json({ ok: false, message: 'Erreur serveur.' });
  }
});

app.post('/api/comments/:chapter', authRequired, async (req, res) => {
  try {
    const chapter = Number.parseInt(req.params.chapter, 10);
    const content = String(req.body?.content || '').trim();
    if (Number.isNaN(chapter) || chapter < 1) {
      res.status(400).json({ ok: false, message: 'Chapitre invalide.' });
      return;
    }
    if (!content || content.length > 800) {
      res.status(400).json({ ok: false, message: 'Contenu invalide.' });
      return;
    }
    const id = `c_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const createdAt = new Date().toISOString();
    await run(
      'INSERT INTO comments (id, chapter_number, author, content, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, chapter, req.user.username, content, createdAt]
    );
    res.json({ ok: true, comment: { id, author: req.user.username, content, createdAt } });
  } catch (error) {
    console.error('[api] comments create error:', error);
    res.status(500).json({ ok: false, message: 'Erreur serveur.' });
  }
});

app.delete('/api/comments/:id', authRequired, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const row = await get('SELECT id, author FROM comments WHERE id = ?', [id]);
    if (!row) {
      res.status(404).json({ ok: false, message: 'Commentaire introuvable.' });
      return;
    }
    if (!req.user.isAdmin && row.author !== req.user.username) {
      res.status(403).json({ ok: false, message: 'Suppression non autorisee.' });
      return;
    }
    await run('DELETE FROM comments WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (error) {
    console.error('[api] comments delete error:', error);
    res.status(500).json({ ok: false, message: 'Erreur serveur.' });
  }
});

app.get('/api/forum', async (_req, res) => {
  try {
    const rows = await all(
      'SELECT id, author, content, created_at AS createdAt FROM forum_messages ORDER BY created_at DESC LIMIT 300'
    );
    res.json({ ok: true, messages: rows });
  } catch (error) {
    console.error('[api] forum list error:', error);
    res.status(500).json({ ok: false, message: 'Erreur serveur.' });
  }
});

app.post('/api/forum', authRequired, async (req, res) => {
  try {
    const content = String(req.body?.content || '').trim();
    if (!content || content.length > 800) {
      res.status(400).json({ ok: false, message: 'Contenu invalide.' });
      return;
    }

    const last = await get(
      'SELECT created_at FROM forum_messages WHERE author = ? ORDER BY created_at DESC LIMIT 1',
      [req.user.username]
    );
    if (last) {
      const remaining = FORUM_COOLDOWN_MS - (Date.now() - new Date(last.created_at).getTime());
      if (remaining > 0) {
        res.status(429).json({
          ok: false,
          message: `Attends ${Math.ceil(remaining / 1000)}s avant un nouveau message`
        });
        return;
      }
    }

    const id = `f_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const createdAt = new Date().toISOString();
    await run(
      'INSERT INTO forum_messages (id, author, content, created_at) VALUES (?, ?, ?, ?)',
      [id, req.user.username, content, createdAt]
    );
    res.json({ ok: true, message: { id, author: req.user.username, content, createdAt } });
  } catch (error) {
    console.error('[api] forum create error:', error);
    res.status(500).json({ ok: false, message: 'Erreur serveur.' });
  }
});

app.delete('/api/forum/:id', authRequired, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const row = await get('SELECT id, author FROM forum_messages WHERE id = ?', [id]);
    if (!row) {
      res.status(404).json({ ok: false, message: 'Message introuvable.' });
      return;
    }
    if (!req.user.isAdmin && row.author !== req.user.username) {
      res.status(403).json({ ok: false, message: 'Suppression non autorisee.' });
      return;
    }
    await run('DELETE FROM forum_messages WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (error) {
    console.error('[api] forum delete error:', error);
    res.status(500).json({ ok: false, message: 'Erreur serveur.' });
  }
});

app.get('/api/bookmarks', authRequired, async (req, res) => {
  try {
    const row = await get('SELECT payload_json FROM bookmarks WHERE username = ?', [req.user.username]);
    const bookmarks = row ? JSON.parse(row.payload_json || '[]') : [];
    res.json({ ok: true, bookmarks: Array.isArray(bookmarks) ? bookmarks : [] });
  } catch (error) {
    console.error('[api] bookmarks get error:', error);
    res.status(500).json({ ok: false, message: 'Erreur serveur.' });
  }
});

app.put('/api/bookmarks', authRequired, async (req, res) => {
  try {
    const bookmarks = Array.isArray(req.body?.bookmarks) ? req.body.bookmarks : [];
    await run(
      `
      INSERT INTO bookmarks (username, payload_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(username) DO UPDATE SET
        payload_json=excluded.payload_json,
        updated_at=excluded.updated_at
      `,
      [req.user.username, JSON.stringify(bookmarks), new Date().toISOString()]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('[api] bookmarks put error:', error);
    res.status(500).json({ ok: false, message: 'Erreur serveur.' });
  }
});

app.get('/api/progress/:chapter', authRequired, async (req, res) => {
  try {
    const chapter = Number.parseInt(req.params.chapter, 10);
    if (Number.isNaN(chapter) || chapter < 1) {
      res.status(400).json({ ok: false, message: 'Chapitre invalide.' });
      return;
    }
    const row = await get(
      'SELECT page FROM reader_progress WHERE username = ? AND chapter_number = ?',
      [req.user.username, chapter]
    );
    res.json({ ok: true, page: row ? Number(row.page || 1) : null });
  } catch (error) {
    console.error('[api] progress get error:', error);
    res.status(500).json({ ok: false, message: 'Erreur serveur.' });
  }
});

app.put('/api/progress/:chapter', authRequired, async (req, res) => {
  try {
    const chapter = Number.parseInt(req.params.chapter, 10);
    const page = Number.parseInt(req.body?.page, 10);
    if (Number.isNaN(chapter) || chapter < 1 || Number.isNaN(page) || page < 1) {
      res.status(400).json({ ok: false, message: 'Parametres invalides.' });
      return;
    }
    await run(
      `
      INSERT INTO reader_progress (username, chapter_number, page, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(username, chapter_number) DO UPDATE SET
        page=excluded.page,
        updated_at=excluded.updated_at
      `,
      [req.user.username, chapter, page, new Date().toISOString()]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('[api] progress put error:', error);
    res.status(500).json({ ok: false, message: 'Erreur serveur.' });
  }
});

app.get('/api/mod/overview', authRequired, adminRequired, async (_req, res) => {
  try {
    const comments = await all(
      'SELECT id, chapter_number AS chapterNumber, author, content, created_at AS createdAt FROM comments ORDER BY created_at DESC LIMIT 100'
    );
    const forum = await all(
      'SELECT id, author, content, created_at AS createdAt FROM forum_messages ORDER BY created_at DESC LIMIT 100'
    );
    res.json({ ok: true, comments, forum });
  } catch (error) {
    console.error('[api] mod overview error:', error);
    res.status(500).json({ ok: false, message: 'Erreur serveur.' });
  }
});

app.delete('/api/mod/comment/:id', authRequired, adminRequired, async (req, res) => {
  try {
    await run('DELETE FROM comments WHERE id = ?', [String(req.params.id || '')]);
    res.json({ ok: true });
  } catch (error) {
    console.error('[api] mod comment delete error:', error);
    res.status(500).json({ ok: false, message: 'Erreur serveur.' });
  }
});

app.delete('/api/mod/forum/:id', authRequired, adminRequired, async (req, res) => {
  try {
    await run('DELETE FROM forum_messages WHERE id = ?', [String(req.params.id || '')]);
    res.json({ ok: true });
  } catch (error) {
    console.error('[api] mod forum delete error:', error);
    res.status(500).json({ ok: false, message: 'Erreur serveur.' });
  }
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[api] backend running on http://localhost:${PORT}`);
      console.log(`[api] sqlite file: ${dbPath}`);
    });
  })
  .catch((error) => {
    console.error('[api] startup error:', error);
    process.exit(1);
  });
