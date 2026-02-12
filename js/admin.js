const DATA_PATH = './data/chapters.json';
const DATA_OVERRIDE_KEY = 'nine_peaks_data_override';

function showMessage(id, text, isError = false) {
  const el = document.querySelector(id);
  if (!el) return;
  el.textContent = text;
  el.classList.remove('hidden');
  el.classList.toggle('error', isError);
}

function parseJsonOrNull(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function loadBaseData() {
  const response = await fetch(DATA_PATH, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Erreur HTTP ${response.status}`);
  }
  return response.json();
}

function getOverrideData() {
  const raw = localStorage.getItem(DATA_OVERRIDE_KEY);
  if (!raw) return null;
  return parseJsonOrNull(raw);
}

function setOverrideData(jsonText) {
  localStorage.setItem(DATA_OVERRIDE_KEY, jsonText);
}

function resetOverrideData() {
  localStorage.removeItem(DATA_OVERRIDE_KEY);
}

function validateDataShape(data) {
  return Boolean(data && data.manga && Array.isArray(data.chapters));
}

function downloadJson(filename, content) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function initAdminPage() {
  if (!window.Auth || !window.Auth.requireAdmin()) {
    return;
  }

  const editor = document.querySelector('#json-editor');
  const saveBtn = document.querySelector('#save-json');
  const resetBtn = document.querySelector('#reset-json');
  const downloadBtn = document.querySelector('#download-json');
  const logoutBtn = document.querySelector('#logout-btn');

  if (!editor || !saveBtn || !resetBtn || !downloadBtn || !logoutBtn) return;

  try {
    const baseData = await loadBaseData();
    const overrideData = getOverrideData();
    const dataToEdit = overrideData || baseData;
    editor.value = JSON.stringify(dataToEdit, null, 2);
    showMessage('#admin-message', overrideData ? 'Override local charge.' : 'JSON officiel charge.');
  } catch (error) {
    console.error('[debug] Erreur chargement admin:', error);
    showMessage('#admin-message', 'Impossible de charger data/chapters.json', true);
  }

  saveBtn.addEventListener('click', () => {
    const raw = editor.value;
    const parsed = parseJsonOrNull(raw);
    if (!parsed || !validateDataShape(parsed)) {
      showMessage('#admin-message', 'JSON invalide. Format attendu: { manga, chapters[] }', true);
      return;
    }
    setOverrideData(JSON.stringify(parsed));
    console.log('[debug] Override local sauvegarde');
    showMessage('#admin-message', 'Sauvegarde locale effectuee.');
  });

  resetBtn.addEventListener('click', async () => {
    resetOverrideData();
    try {
      const baseData = await loadBaseData();
      editor.value = JSON.stringify(baseData, null, 2);
      showMessage('#admin-message', 'Override supprime. Retour au JSON officiel.');
    } catch (error) {
      console.error('[debug] Erreur reset override:', error);
      showMessage('#admin-message', 'Override supprime mais rechargement impossible.', true);
    }
  });

  downloadBtn.addEventListener('click', () => {
    downloadJson('chapters.json', editor.value);
    showMessage('#admin-message', 'Fichier chapters.json telecharge.');
  });

  logoutBtn.addEventListener('click', () => {
    window.Auth.logout();
    window.location.href = 'login.html';
  });
}

function initAdminFeatures() {
  const page = document.body.dataset.page;
  if (page === 'admin') {
    initAdminPage();
  }
}

document.addEventListener('DOMContentLoaded', initAdminFeatures);
