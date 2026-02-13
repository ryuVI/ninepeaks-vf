// Authentification locale pour site statique (stockage navigateur).
// Important: sans backend, la securite reste limitee.
(() => {
  const USERS_KEY = 'nine_peaks_users';
  const SESSION_KEY = 'nine_peaks_session';
  const API_TOKEN_KEY = 'nine_peaks_api_token';
  const LEGACY_ADMIN_SESSION_KEY = 'nine_peaks_admin_session';
  const ATTEMPTS_KEY = 'nine_peaks_auth_attempts';
  const API_BASE_URL_FALLBACK = 'http://localhost:4000/api';
  const API_BASE_URL_STORAGE_KEY = 'nine_peaks_api_base_url';
  let backendAvailabilityCache = null;
  let backendAvailabilityTs = 0;
  const BACKEND_CACHE_TTL_MS = 15000;
  let activeApiBaseUrl = '';

  const SESSION_DURATION_MS = 1000 * 60 * 60 * 12;
  const ADMIN_USERNAMES = ['pcatv'];
  const ADMIN_BOOTSTRAP_USERNAME = 'pcatv';
  const ADMIN_BOOTSTRAP_PASSWORD = 'N!nePeaks_2026#Admin$Q7';
  const ADMIN_PASSWORD_VERSION = 1;

  const HASH_ALGO = 'pbkdf2-sha256-v1';
  const PBKDF2_ITERATIONS = 210000;
  const PBKDF2_KEY_LENGTH = 32;

  const MAX_FAILS_PER_USER = 5;
  const LOCK_DURATION_MS = 1000 * 60 * 10;
  const ATTEMPT_WINDOW_MS = 1000 * 60 * 10;
  const BASE_FAIL_DELAY_MS = 350;

  function normalizeApiBase(raw) {
    const value = String(raw || '').trim();
    if (!value) return '';
    return value.endsWith('/') ? value.slice(0, -1) : value;
  }

  function getApiBaseCandidates() {
    const list = [];
    const explicit = normalizeApiBase(localStorage.getItem(API_BASE_URL_STORAGE_KEY));
    if (explicit) list.push(explicit);

    const currentOrigin = normalizeApiBase(window.location.origin || '');
    if (currentOrigin && !currentOrigin.startsWith('file://')) {
      list.push(`${currentOrigin}/api`);
    }
    list.push(API_BASE_URL_FALLBACK);
    return Array.from(new Set(list));
  }

  async function detectApiBaseUrl() {
    if (activeApiBaseUrl) return activeApiBaseUrl;
    const candidates = getApiBaseCandidates();
    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      try {
        const response = await fetch(`${candidate}/health`, { method: 'GET' });
        if (response.ok) {
          activeApiBaseUrl = candidate;
          console.log('[debug] API base detectee:', activeApiBaseUrl);
          return activeApiBaseUrl;
        }
      } catch {
        // ignore
      }
    }
    return '';
  }

  function normalizeUsername(username) {
    return String(username || '').trim().toLowerCase();
  }

  function utf8ToBytes(text) {
    return new TextEncoder().encode(text);
  }

  function bytesToBase64(bytes) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i += 1) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function base64ToBytes(base64Text) {
    const binary = atob(base64Text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function secureRandomBase64(size = 16) {
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    return bytesToBase64(bytes);
  }

  function constantTimeEqual(a, b) {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i += 1) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }

  async function sha256(text) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', utf8ToBytes(text));
    return bytesToBase64(new Uint8Array(hashBuffer));
  }

  async function pbkdf2Hash(password, saltBase64, iterations = PBKDF2_ITERATIONS) {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      utf8ToBytes(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: base64ToBytes(saltBase64),
        iterations
      },
      keyMaterial,
      PBKDF2_KEY_LENGTH * 8
    );
    return bytesToBase64(new Uint8Array(bits));
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

  async function ensureAdminBootstrapAccount() {
    const users = readUsers();
    const username = normalizeUsername(ADMIN_BOOTSTRAP_USERNAME);
    let user = users.find((item) => item.username === username);

    if (!user) {
      user = {
        username,
        createdAt: new Date().toISOString()
      };
      users.push(user);
    }

    // Reinitialise le mot de passe admin si version differente.
    if (user.adminPasswordVersion !== ADMIN_PASSWORD_VERSION) {
      const passwordSalt = secureRandomBase64(16);
      const passwordHash = await pbkdf2Hash(ADMIN_BOOTSTRAP_PASSWORD, passwordSalt, PBKDF2_ITERATIONS);
      user.passwordSalt = passwordSalt;
      user.passwordHash = passwordHash;
      user.hashAlgo = HASH_ALGO;
      user.iterations = PBKDF2_ITERATIONS;
      user.adminPasswordVersion = ADMIN_PASSWORD_VERSION;
      user.updatedAt = new Date().toISOString();
      saveUsers(users);
      console.log('[debug] Mot de passe admin reinitialise:', username);
    }
  }

  function readAttempts() {
    try {
      const raw = localStorage.getItem(ATTEMPTS_KEY);
      if (!raw) return { users: {} };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return { users: {} };
      if (!parsed.users || typeof parsed.users !== 'object') parsed.users = {};
      return parsed;
    } catch {
      return { users: {} };
    }
  }

  function saveAttempts(attempts) {
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(attempts));
  }

  function resetAttemptsForUser(username) {
    const attempts = readAttempts();
    delete attempts.users[username];
    saveAttempts(attempts);
  }

  function checkUserLock(username) {
    const attempts = readAttempts();
    const row = attempts.users[username];
    if (!row) return { locked: false, retryAfterSec: 0 };
    const now = Date.now();
    if (row.lockedUntil && now < row.lockedUntil) {
      const retryAfterSec = Math.ceil((row.lockedUntil - now) / 1000);
      return { locked: true, retryAfterSec };
    }
    return { locked: false, retryAfterSec: 0 };
  }

  function recordFailedLogin(username) {
    const attempts = readAttempts();
    const now = Date.now();
    const row = attempts.users[username] || { failCount: 0, firstFailAt: now, lockedUntil: 0 };

    if (!row.firstFailAt || now - row.firstFailAt > ATTEMPT_WINDOW_MS) {
      row.failCount = 0;
      row.firstFailAt = now;
      row.lockedUntil = 0;
    }

    row.failCount += 1;
    if (row.failCount >= MAX_FAILS_PER_USER) {
      row.lockedUntil = now + LOCK_DURATION_MS;
    }

    attempts.users[username] = row;
    saveAttempts(attempts);

    return row.failCount;
  }

  async function delayForFailedAttempt(failCount) {
    const ms = Math.min(1800, BASE_FAIL_DELAY_MS * Math.max(1, failCount));
    await new Promise((resolve) => setTimeout(resolve, ms));
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

  function getApiToken() {
    return localStorage.getItem(API_TOKEN_KEY) || '';
  }

  function setApiToken(token) {
    if (!token) return;
    localStorage.setItem(API_TOKEN_KEY, token);
  }

  function clearApiToken() {
    localStorage.removeItem(API_TOKEN_KEY);
  }

  async function apiRequest(path, options = {}) {
    const baseUrl = activeApiBaseUrl || (await detectApiBaseUrl()) || API_BASE_URL_FALLBACK;
    const url = `${baseUrl}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    const token = getApiToken();
    if (token && !headers.Authorization) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const payload = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      status: response.status,
      payload
    };
  }

  async function isBackendAvailable() {
    const now = Date.now();
    if (backendAvailabilityCache !== null && now - backendAvailabilityTs < BACKEND_CACHE_TTL_MS) {
      return backendAvailabilityCache;
    }
    try {
      const detected = await detectApiBaseUrl();
      const response = detected
        ? { ok: true }
        : await fetch(`${API_BASE_URL_FALLBACK}/health`, { method: 'GET' });
      backendAvailabilityCache = Boolean(response.ok);
      backendAvailabilityTs = now;
      return backendAvailabilityCache;
    } catch {
      backendAvailabilityCache = false;
      backendAvailabilityTs = now;
      return false;
    }
  }

  async function callApi(path, options = {}) {
    return apiRequest(path, options);
  }

  function buildSessionFingerprintSync(username) {
    return `${username}|${navigator.userAgent || ''}`;
  }

  function setSession(username) {
    const fingerprint = buildSessionFingerprintSync(username);
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        version: 2,
        sessionId: secureRandomBase64(24),
        username,
        fingerprint,
        createdAt: Date.now(),
        expiresAt: Date.now() + SESSION_DURATION_MS
      })
    );
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(LEGACY_ADMIN_SESSION_KEY);
    clearApiToken();
  }

  function isSessionValid() {
    const session = getSession();
    if (!session) return false;

    if (!session.username || !session.fingerprint || !session.expiresAt) {
      logout();
      return false;
    }
    if (Date.now() > Number(session.expiresAt)) {
      logout();
      return false;
    }

    const expectedFingerprint = buildSessionFingerprintSync(normalizeUsername(session.username));
    if (!constantTimeEqual(String(session.fingerprint), expectedFingerprint)) {
      logout();
      return false;
    }

    return true;
  }

  function getCurrentUser() {
    const ok = isSessionValid();
    if (!ok) return null;
    const session = getSession();
    const username = normalizeUsername(session.username);
    if (!username) return null;
    return {
      username,
      isAdmin: ADMIN_USERNAMES.includes(username)
    };
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

  async function verifyPasswordAndMigrateIfNeeded(foundUser, password, users) {
    if (foundUser.hashAlgo === HASH_ALGO && foundUser.passwordSalt) {
      const hash = await pbkdf2Hash(password, foundUser.passwordSalt, foundUser.iterations || PBKDF2_ITERATIONS);
      return constantTimeEqual(hash, foundUser.passwordHash || '');
    }

    // Compatibilite avec les anciens comptes (SHA-256 base64).
    const legacyHash = await sha256(password);
    if (!constantTimeEqual(legacyHash, foundUser.passwordHash || '')) {
      return false;
    }

    // Migration silencieuse vers PBKDF2.
    const newSalt = secureRandomBase64(16);
    const newHash = await pbkdf2Hash(password, newSalt, PBKDF2_ITERATIONS);
    foundUser.passwordSalt = newSalt;
    foundUser.passwordHash = newHash;
    foundUser.hashAlgo = HASH_ALGO;
    foundUser.iterations = PBKDF2_ITERATIONS;
    saveUsers(users);
    console.log('[debug] Compte migre vers hash PBKDF2:', foundUser.username);
    return true;
  }

  async function signUp(usernameRaw, passwordRaw) {
    const backendUp = await isBackendAvailable();
    if (backendUp) {
      try {
        const result = await apiRequest('/auth/signup', {
          method: 'POST',
          body: {
            username: usernameRaw,
            password: passwordRaw
          }
        });
        if (!result.ok) {
          return { ok: false, message: result.payload?.message || 'Inscription impossible.' };
        }
        return { ok: true, message: result.payload?.message || 'Compte cree avec succes.' };
      } catch (error) {
        console.log('[debug] Backend signup indisponible, fallback local:', error);
      }
    }

    await ensureAdminBootstrapAccount();
    const username = normalizeUsername(usernameRaw);
    const password = String(passwordRaw || '');

    const usernameError = validateUsername(username);
    if (usernameError) return { ok: false, message: usernameError };

    const passwordError = validatePassword(password);
    if (passwordError) return { ok: false, message: passwordError };

    const users = readUsers();
    if (users.some((user) => user.username === username)) {
      return { ok: false, message: 'Ce nom utilisateur existe deja.' };
    }

    const passwordSalt = secureRandomBase64(16);
    const passwordHash = await pbkdf2Hash(password, passwordSalt, PBKDF2_ITERATIONS);
    users.push({
      username,
      passwordHash,
      passwordSalt,
      hashAlgo: HASH_ALGO,
      iterations: PBKDF2_ITERATIONS,
      createdAt: new Date().toISOString()
    });
    saveUsers(users);
    return { ok: true, message: 'Compte cree avec succes.' };
  }

  async function login(usernameRaw, passwordRaw) {
    const backendUp = await isBackendAvailable();
    if (backendUp) {
      try {
        const result = await apiRequest('/auth/login', {
          method: 'POST',
          body: {
            username: usernameRaw,
            password: passwordRaw
          }
        });
        if (!result.ok) {
          return { ok: false, message: result.payload?.message || 'Connexion impossible.' };
        }
        const username = normalizeUsername(result.payload?.user?.username || usernameRaw);
        const token = String(result.payload?.token || '');
        if (token) setApiToken(token);
        setSession(username);
        return {
          ok: true,
          message: result.payload?.message || 'Connexion reussie.',
          user: {
            username,
            isAdmin: ADMIN_USERNAMES.includes(username)
          }
        };
      } catch (error) {
        console.log('[debug] Backend login indisponible, fallback local:', error);
      }
    }

    await ensureAdminBootstrapAccount();
    // Desactive le verrouillage de tentatives pour laisser l'utilisateur reessayer librement.
    localStorage.removeItem(ATTEMPTS_KEY);
    const username = normalizeUsername(usernameRaw);
    const password = String(passwordRaw || '');

    const users = readUsers();
    const found = users.find((user) => user.username === username);
    if (!found) {
      return { ok: false, message: 'Compte introuvable. Inscris-toi d abord.' };
    }

    const passwordOk = await verifyPasswordAndMigrateIfNeeded(found, password, users);
    if (!passwordOk) {
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
    requireAdmin,
    callApi,
    isBackendAvailable
  };
})();
