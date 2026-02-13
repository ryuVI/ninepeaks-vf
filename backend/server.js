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

async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
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
    req.user = {
      username: normalizeUsername(payload.username),
      isAdmin: ADMIN_USERNAMES.has(normalizeUsername(payload.username))
    };
    next();
  } catch {
    res.status(401).json({ ok: false, message: 'Session invalide ou expiree.' });
  }
}

const app = express();
app.use(helmet());
app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN, credentials: false }));
app.use(express.json({ limit: '256kb' }));

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(globalLimiter);

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
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
