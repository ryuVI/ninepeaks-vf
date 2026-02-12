function getRedirectTarget() {
  const params = new URLSearchParams(window.location.search);
  return params.get('redirect') || 'index.html';
}

function showAuthMessage(text, isError = false) {
  const msg = document.querySelector('#auth-message');
  if (!msg) return;
  msg.textContent = text;
  msg.classList.remove('hidden');
  msg.classList.toggle('error', isError);
}

function initAccountPage() {
  if (document.body.dataset.page !== 'login') return;

  const loginForm = document.querySelector('#login-form');
  const signupForm = document.querySelector('#signup-form');
  if (!loginForm || !signupForm || !window.Auth) return;

  const currentUser = window.Auth.getCurrentUser();
  if (currentUser) {
    showAuthMessage(`Tu es deja connecte en tant que ${currentUser.username}. Redirection...`);
    window.setTimeout(() => {
      window.location.href = getRedirectTarget();
    }, 800);
    return;
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    const username = String(formData.get('username') || '');
    const password = String(formData.get('password') || '');

    const result = await window.Auth.login(username, password);
    console.log('[debug] Login utilisateur:', result);
    if (!result.ok) {
      showAuthMessage(result.message, true);
      return;
    }
    showAuthMessage('Connexion OK. Redirection...');
    window.location.href = getRedirectTarget();
  });

  signupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(signupForm);
    const username = String(formData.get('username') || '');
    const password = String(formData.get('password') || '');

    const signupResult = await window.Auth.signUp(username, password);
    console.log('[debug] Signup utilisateur:', signupResult);
    if (!signupResult.ok) {
      showAuthMessage(signupResult.message, true);
      return;
    }

    const loginResult = await window.Auth.login(username, password);
    if (!loginResult.ok) {
      showAuthMessage('Compte cree, mais connexion auto impossible.', true);
      return;
    }
    showAuthMessage('Compte cree et connecte. Redirection...');
    window.location.href = getRedirectTarget();
  });
}

document.addEventListener('DOMContentLoaded', initAccountPage);
