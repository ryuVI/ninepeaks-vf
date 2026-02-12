// Authentification locale pour site statique (stockage navigateur).
// Ce systeme n'est pas une securite serveur.
(() => {
  const USERS_KEY = 'nine_peaks_users';
  const SESSION_KEY = 'nine_peaks_session';
  const LEGACY_ADMIN_SESSION_KEY = 'nine_peaks_admin_session';
  const SESSION_DURATION_MS = 1000 * 60 * 60 * 12;
  const ADMIN_USERNAMES = ['pcatv'];

  async function sha256(text) {
    const data = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function normalizeUsername(username) {
    return String(username || '').trim().toLowerCase();
  }

  function readUsers() {
    try {
      const raw = localStorage.getItem(USERS_KEY);
      if (!raw) return [];
      const users = JSON.parse(raw);
      return Array.isArray(users) ? users : [];
    } catch (error) {
      console.log('[debug] Lecture users invalide:', error);
      return [];
    }
  }

  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  function getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (error) {
      console.log('[debug] Session invalide:', error);
      return null;
    }
  }

  function setSession(username) {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        username,
        expiresAt: Date.now() + SESSION_DURATION_MS
      })
    );
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(LEGACY_ADMIN_SESSION_KEY);
  }

  function isSessionValid() {
    const session = getSession();
    if (!session) return false;
    if (Date.now() > Number(session.expiresAt)) {
      logout();
      return false;
    }
    return true;
  }

  function getCurrentUser() {
    if (!isSessionValid()) return null;
    const session = getSession();
    const username = normalizeUsername(session.username);
    if (!username) return null;
    return {
      username,
      isAdmin: ADMIN_USERNAMES.includes(username)
    };
  }

  async function signUp(usernameRaw, passwordRaw) {
    const username = normalizeUsername(usernameRaw);
    const password = String(passwordRaw || '');

    if (username.length < 3) {
      return { ok: false, message: 'Le nom utilisateur doit faire au moins 3 caracteres.' };
    }
    if (password.length < 6) {
      return { ok: false, message: 'Le mot de passe doit faire au moins 6 caracteres.' };
    }

    const users = readUsers();
    if (users.some((user) => user.username === username)) {
      return { ok: false, message: 'Ce nom utilisateur existe deja.' };
    }

    const passwordHash = await sha256(password);
    users.push({
      username,
      passwordHash,
      createdAt: new Date().toISOString()
    });
    saveUsers(users);

    return { ok: true, message: 'Compte cree avec succes.' };
  }

  async function login(usernameRaw, passwordRaw) {
    const username = normalizeUsername(usernameRaw);
    const password = String(passwordRaw || '');

    const users = readUsers();
    const found = users.find((user) => user.username === username);
    if (!found) {
      return { ok: false, message: 'Compte introuvable. Inscris-toi d abord.' };
    }

    const providedHash = await sha256(password);
    if (providedHash !== found.passwordHash) {
      return { ok: false, message: 'Mot de passe incorrect.' };
    }

    setSession(username);
    return {
      ok: true,
      message: 'Connexion reussie.',
      user: {
        username,
        isAdmin: ADMIN_USERNAMES.includes(username)
      }
    };
  }

  function requireAdmin() {
    const user = getCurrentUser();
    if (!user) {
      const redirect = encodeURIComponent(window.location.pathname.split('/').pop() || 'admin.html');
      window.location.href = `login.html?redirect=${redirect}`;
      return false;
    }
    if (!user.isAdmin) {
      window.location.href = 'index.html';
      return false;
    }
    return true;
  }

  window.Auth = {
    signUp,
    login,
    logout,
    getCurrentUser,
    isLoggedIn: () => Boolean(getCurrentUser()),
    requireAdmin
  };
})();
