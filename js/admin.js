const DATA_PATH = './data/chapters.json';
const SITE_DATA_KEY = 'nine_peaks_site_data';
const LEGACY_OVERRIDE_KEY = 'nine_peaks_data_override';

let projectDirectoryHandle = null;
let currentData = null;
let selectedChapterNumber = null;

function showMessage(text, isError = false) {
  const el = document.querySelector('#admin-message');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('hidden');
  el.classList.toggle('error', isError);
}

function setUploadStatus(text, isError = false) {
  const statusEl = document.querySelector('#upload-status');
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
}

function parseJsonOrNull(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function validateDataShape(data) {
  return Boolean(data && data.manga && Array.isArray(data.chapters));
}

async function loadBaseData() {
  const response = await fetch(DATA_PATH, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
  return response.json();
}

function readStoredData() {
  const localRaw = localStorage.getItem(SITE_DATA_KEY);
  const localData = parseJsonOrNull(localRaw);
  if (validateDataShape(localData)) return localData;

  const legacyRaw = localStorage.getItem(LEGACY_OVERRIDE_KEY);
  const legacyData = parseJsonOrNull(legacyRaw);
  if (validateDataShape(legacyData)) return legacyData;

  return null;
}

function persistSiteData() {
  if (!validateDataShape(currentData)) return;
  localStorage.setItem(SITE_DATA_KEY, JSON.stringify(currentData));
}

function resetSiteDataStorage() {
  localStorage.removeItem(SITE_DATA_KEY);
  localStorage.removeItem(LEGACY_OVERRIDE_KEY);
}

function sortChapters() {
  currentData.chapters.sort((a, b) => a.number - b.number);
}

function getChapterByNumber(chapterNumber) {
  return currentData.chapters.find((chapter) => chapter.number === chapterNumber) || null;
}

function sanitizeUploadFiles(fileList) {
  const files = Array.from(fileList || []);
  const sorted = files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const invalid = sorted.find((file) => !/\.(jpe?g)$/i.test(file.name));
  if (invalid) return { ok: false, message: `Format non supporte: ${invalid.name}` };
  return { ok: true, files: sorted };
}

async function ensureSubDirectory(parentHandle, directoryName) {
  return parentHandle.getDirectoryHandle(directoryName, { create: true });
}

async function writeFile(directoryHandle, fileName, data) {
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
}

async function readFileBlob(directoryHandle, fileName) {
  const fileHandle = await directoryHandle.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  return file;
}

async function deleteFileIfExists(directoryHandle, fileName) {
  try {
    await directoryHandle.removeEntry(fileName);
  } catch {
    // ignore
  }
}

async function isProjectRootHandle(directoryHandle) {
  if (!directoryHandle) return false;
  try {
    await directoryHandle.getFileHandle('index.html');
    await directoryHandle.getDirectoryHandle('data');
    await directoryHandle.getDirectoryHandle('mangas');
    return true;
  } catch {
    return false;
  }
}

async function getChapterDir(folderName) {
  const mangasDir = await ensureSubDirectory(projectDirectoryHandle, 'mangas');
  const ninePeaksDir = await ensureSubDirectory(mangasDir, 'nine-peaks');
  return ensureSubDirectory(ninePeaksDir, folderName);
}

async function writeChaptersJsonToProject() {
  if (!projectDirectoryHandle) return;
  const dataDir = await ensureSubDirectory(projectDirectoryHandle, 'data');
  const blob = new Blob([JSON.stringify(currentData, null, 2)], { type: 'application/json' });
  await writeFile(dataDir, 'chapters.json', blob);
}

function fillMangaForm(data) {
  const manga = data.manga || {};
  const titleInput = document.querySelector('#quick-manga-title');
  const coverInput = document.querySelector('#quick-manga-cover');
  const synopsisInput = document.querySelector('#quick-manga-synopsis');
  const genresInput = document.querySelector('#quick-manga-genres');
  if (titleInput) titleInput.value = manga.title || '';
  if (coverInput) coverInput.value = manga.cover || '';
  if (synopsisInput) synopsisInput.value = manga.synopsis || '';
  if (genresInput) genresInput.value = Array.isArray(manga.genres) ? manga.genres.join(', ') : '';
}

function renderChapterSelect() {
  const select = document.querySelector('#chapter-select');
  if (!select) return;

  const chapters = currentData.chapters.slice().sort((a, b) => b.number - a.number);
  select.innerHTML = '<option value="">Selectionner un chapitre...</option>';
  chapters.forEach((chapter) => {
    const option = document.createElement('option');
    option.value = String(chapter.number);
    option.textContent = `Chapitre ${chapter.number} - ${chapter.title || 'Sans titre'}`;
    select.appendChild(option);
  });

  const stillExists = chapters.some((chapter) => chapter.number === selectedChapterNumber);
  if (!stillExists) selectedChapterNumber = null;
  select.value = selectedChapterNumber ? String(selectedChapterNumber) : '';
  renderSelectedChapterMeta();
}

function renderSelectedChapterMeta() {
  const metaEl = document.querySelector('#selected-chapter-meta');
  if (!metaEl) return;
  if (!selectedChapterNumber) {
    metaEl.textContent = 'Aucun chapitre selectionne.';
    return;
  }
  const chapter = getChapterByNumber(selectedChapterNumber);
  if (!chapter) {
    metaEl.textContent = 'Aucun chapitre selectionne.';
    return;
  }
  metaEl.textContent = `Chapitre ${chapter.number} | ${chapter.pages} pages | Dossier: ${chapter.folder}`;
}

async function createChapter() {
  if (!projectDirectoryHandle) {
    showMessage('Choisis d abord la racine du projet.', true);
    return;
  }

  const numberInput = document.querySelector('#create-chapter-number');
  const titleInput = document.querySelector('#create-chapter-title');
  const dateInput = document.querySelector('#create-chapter-date');
  const filesInput = document.querySelector('#create-chapter-files');

  const number = Number.parseInt(String(numberInput?.value || ''), 10);
  const title = String(titleInput?.value || '').trim();
  const date = String(dateInput?.value || '').trim();
  const fileCheck = sanitizeUploadFiles(filesInput?.files);

  if (Number.isNaN(number) || number < 1 || !title || !date) {
    showMessage('Renseigne numero, titre et date valides.', true);
    return;
  }
  if (getChapterByNumber(number)) {
    showMessage(`Le chapitre ${number} existe deja. Selectionne-le pour ajouter des pages.`, true);
    return;
  }
  if (!fileCheck.ok || !fileCheck.files.length) {
    showMessage(fileCheck.ok ? 'Ajoute au moins une image pour creer le chapitre.' : fileCheck.message, true);
    return;
  }

  try {
    const folder = `chapter-${number}`;
    const chapterDir = await getChapterDir(folder);
    for (let i = 0; i < fileCheck.files.length; i += 1) {
      const pageName = `${String(i + 1).padStart(2, '0')}.jpg`;
      await writeFile(chapterDir, pageName, fileCheck.files[i]);
    }
    await writeFile(chapterDir, 'cover.jpg', fileCheck.files[0]);

    currentData.chapters.push({
      number,
      title,
      date,
      pages: fileCheck.files.length,
      folder,
      cover: `mangas/nine-peaks/${folder}/cover.jpg`
    });
    sortChapters();
    persistSiteData();
    await writeChaptersJsonToProject();

    selectedChapterNumber = number;
    renderChapterSelect();
    if (filesInput) filesInput.value = '';
    if (numberInput) numberInput.value = '';
    if (titleInput) titleInput.value = '';
    if (dateInput) dateInput.value = '';
    showMessage(`Chapitre ${number} cree avec ${fileCheck.files.length} pages.`);
  } catch (error) {
    console.error('[debug] Erreur creation chapitre:', error);
    showMessage('Erreur pendant la creation du chapitre.', true);
  }
}

async function addPageToSelectedChapter() {
  if (!projectDirectoryHandle) {
    showMessage('Choisis d abord la racine du projet.', true);
    return;
  }
  if (!selectedChapterNumber) {
    showMessage('Selectionne d abord un chapitre existant.', true);
    return;
  }

  const chapter = getChapterByNumber(selectedChapterNumber);
  const fileInput = document.querySelector('#add-page-file');
  const file = fileInput?.files?.[0];
  if (!chapter) {
    showMessage('Chapitre introuvable.', true);
    return;
  }
  if (!file || !/\.(jpe?g)$/i.test(file.name)) {
    showMessage('Selectionne une image jpg/jpeg valide.', true);
    return;
  }

  try {
    const chapterDir = await getChapterDir(chapter.folder);
    const newPage = Number(chapter.pages || 0) + 1;
    await writeFile(chapterDir, `${String(newPage).padStart(2, '0')}.jpg`, file);
    if (newPage === 1) {
      await writeFile(chapterDir, 'cover.jpg', file);
    }

    chapter.pages = newPage;
    persistSiteData();
    await writeChaptersJsonToProject();
    if (fileInput) fileInput.value = '';
    renderSelectedChapterMeta();
    showMessage(`Page ${newPage} ajoutee au chapitre ${chapter.number}.`);
  } catch (error) {
    console.error('[debug] Erreur ajout page:', error);
    showMessage('Erreur pendant l ajout de la page.', true);
  }
}

async function removePageFromSelectedChapter() {
  if (!projectDirectoryHandle) {
    showMessage('Choisis d abord la racine du projet.', true);
    return;
  }
  if (!selectedChapterNumber) {
    showMessage('Selectionne d abord un chapitre existant.', true);
    return;
  }

  const chapter = getChapterByNumber(selectedChapterNumber);
  const pageInput = document.querySelector('#remove-page-number');
  const targetPage = Number.parseInt(String(pageInput?.value || ''), 10);
  if (!chapter) {
    showMessage('Chapitre introuvable.', true);
    return;
  }
  if (Number.isNaN(targetPage) || targetPage < 1 || targetPage > chapter.pages) {
    showMessage(`Numero invalide. Choisis entre 1 et ${chapter.pages}.`, true);
    return;
  }

  try {
    const chapterDir = await getChapterDir(chapter.folder);
    for (let i = targetPage + 1; i <= chapter.pages; i += 1) {
      const sourceName = `${String(i).padStart(2, '0')}.jpg`;
      const destName = `${String(i - 1).padStart(2, '0')}.jpg`;
      const blob = await readFileBlob(chapterDir, sourceName);
      await writeFile(chapterDir, destName, blob);
    }
    await deleteFileIfExists(chapterDir, `${String(chapter.pages).padStart(2, '0')}.jpg`);
    chapter.pages = Math.max(0, chapter.pages - 1);

    if (chapter.pages > 0) {
      const firstBlob = await readFileBlob(chapterDir, '01.jpg');
      await writeFile(chapterDir, 'cover.jpg', firstBlob);
    } else {
      await deleteFileIfExists(chapterDir, 'cover.jpg');
    }

    persistSiteData();
    await writeChaptersJsonToProject();
    if (pageInput) pageInput.value = '';
    renderSelectedChapterMeta();
    showMessage(`Page ${targetPage} supprimee du chapitre ${chapter.number}.`);
  } catch (error) {
    console.error('[debug] Erreur suppression page:', error);
    showMessage('Erreur pendant la suppression de page.', true);
  }
}

function setupProjectFolderSelection() {
  const selectFolderBtn = document.querySelector('#select-project-folder');
  if (!selectFolderBtn) return;

  if (!window.showDirectoryPicker) {
    setUploadStatus('Fonction non supportee ici. Utilise Chrome/Edge recent.', true);
    selectFolderBtn.disabled = true;
    return;
  }

  selectFolderBtn.addEventListener('click', async () => {
    try {
      const selectedHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      const isRoot = await isProjectRootHandle(selectedHandle);
      if (!isRoot) {
        projectDirectoryHandle = null;
        setUploadStatus('Choisis la racine du projet (index.html, data/, mangas/).', true);
        return;
      }
      projectDirectoryHandle = selectedHandle;
      setUploadStatus(`Dossier projet valide: ${projectDirectoryHandle.name}`);
    } catch (error) {
      console.log('[debug] Selection dossier annulee:', error);
      setUploadStatus('Selection dossier annulee.', true);
    }
  });
}

function setupMangaActions() {
  const applyMangaBtn = document.querySelector('#apply-manga');
  const resetDataBtn = document.querySelector('#reset-data');
  const mangaTitleInput = document.querySelector('#quick-manga-title');
  const mangaCoverInput = document.querySelector('#quick-manga-cover');
  const mangaSynopsisInput = document.querySelector('#quick-manga-synopsis');
  const mangaGenresInput = document.querySelector('#quick-manga-genres');

  applyMangaBtn?.addEventListener('click', async () => {
    currentData.manga.title = String(mangaTitleInput?.value || '').trim();
    currentData.manga.cover = String(mangaCoverInput?.value || '').trim();
    currentData.manga.synopsis = String(mangaSynopsisInput?.value || '').trim();
    currentData.manga.genres = String(mangaGenresInput?.value || '')
      .split(',')
      .map((genre) => genre.trim())
      .filter(Boolean);
    persistSiteData();
    await writeChaptersJsonToProject();
    showMessage('Infos manga mises a jour.');
  });

  resetDataBtn?.addEventListener('click', async () => {
    resetSiteDataStorage();
    try {
      currentData = await loadBaseData();
      sortChapters();
      fillMangaForm(currentData);
      renderChapterSelect();
      showMessage('Retour aux donnees de base effectue.');
    } catch (error) {
      console.error('[debug] Erreur reset:', error);
      showMessage('Impossible de recharger les donnees.', true);
    }
  });
}

function setupChapterActions() {
  const select = document.querySelector('#chapter-select');
  const createBtn = document.querySelector('#create-chapter-btn');
  const addPageBtn = document.querySelector('#add-page-btn');
  const removePageBtn = document.querySelector('#remove-page-btn');

  select?.addEventListener('change', () => {
    const value = Number.parseInt(select.value, 10);
    selectedChapterNumber = Number.isNaN(value) ? null : value;
    renderSelectedChapterMeta();
  });

  createBtn?.addEventListener('click', createChapter);
  addPageBtn?.addEventListener('click', addPageToSelectedChapter);
  removePageBtn?.addEventListener('click', removePageFromSelectedChapter);
}

async function initAdminPage() {
  if (!window.Auth || !window.Auth.requireAdmin()) return;

  try {
    const baseData = await loadBaseData();
    currentData = readStoredData() || baseData;
    sortChapters();
    fillMangaForm(currentData);
    renderChapterSelect();
    showMessage('Panel admin pret.');
  } catch (error) {
    console.error('[debug] Erreur chargement admin:', error);
    showMessage('Impossible de charger les donnees.', true);
    return;
  }

  setupProjectFolderSelection();
  setupMangaActions();
  setupChapterActions();

  const logoutBtn = document.querySelector('#logout-btn');
  logoutBtn?.addEventListener('click', () => {
    window.Auth.logout();
    window.location.href = 'login.html';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'admin') {
    initAdminPage();
  }
});
