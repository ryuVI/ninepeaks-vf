// Authentification simple cote client pour site statique.
// Important: ce n'est pas une securite forte (code visible sur GitHub).
(() => {
  const AUTH_STORAGE_KEY = 'nine_peaks_admin_session';
  const SESSION_DURATION_MS = 1000 * 60 * 60 * 8;

  const authConfig = {
    username: 'pcatv',
    passwordHash: '919bcb3bf09b8629c7f33b98c9bb5604617befa494460c07a9b08f2f26b44245'
  };

  async function sha256(text) {
    const data = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function getSession() {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (error) {
      console.log('[debug] Session invalide:', error);
      return null;
    }
  }

  function setSession(username) {
    const session = {
      username,
      expiresAt: Date.now() + SESSION_DURATION_MS
    };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  }

  function clearSession() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }

  function isLoggedIn() {
    const session = getSession();
    if (!session) return false;
    if (Date.now() > session.expiresAt) {
      clearSession();
      return false;
    }
    return session.username === authConfig.username;
  }

  async function login(username, password) {
    const userOk = username.trim().toLowerCase() === authConfig.username;
    const passwordHash = await sha256(password);
    const passOk = passwordHash === authConfig.passwordHash;
    if (!userOk || !passOk) {
      return false;
    }
    setSession(authConfig.username);
    return true;
  }

  function requireAdmin() {
    if (!isLoggedIn()) {
      const redirect = encodeURIComponent(window.location.pathname.split('/').pop() || 'admin.html');
      window.location.href = `login.html?redirect=${redirect}`;
      return false;
    }
    return true;
  }

  window.Auth = {
    config: authConfig,
    login,
    logout: clearSession,
    isLoggedIn,
    requireAdmin
  };
})();
