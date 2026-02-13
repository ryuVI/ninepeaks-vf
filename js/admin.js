const DATA_PATH = './data/chapters.json';
const SITE_DATA_KEY = 'nine_peaks_site_data';
const LEGACY_OVERRIDE_KEY = 'nine_peaks_data_override';

let projectDirectoryHandle = null;
let currentData = null;
let selectedChapterNumber = null;
const IMAGE_VARIANTS = [1200, 800];

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

function upsertChapterData(chapterNumber, title, date, pageCount) {
  const folder = `chapter-${chapterNumber}`;
  const existing = getChapterByNumber(chapterNumber);
  const baseChapter = {
    number: chapterNumber,
    title,
    date,
    pages: pageCount,
    folder,
    cover: `mangas/nine-peaks/${folder}/cover.jpg`
  };
  if (existing) {
    existing.title = title;
    existing.date = date;
    existing.pages = pageCount;
    existing.folder = folder;
    existing.cover = baseChapter.cover;
    return existing;
  }
  currentData.chapters.push(baseChapter);
  sortChapters();
  return baseChapter;
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

async function blobFromImageFile(file) {
  const bitmap = await createImageBitmap(file);
  return bitmap;
}

async function createWebpVariant(file, maxWidth) {
  const bitmap = await blobFromImageFile(file);
  const ratio = bitmap.width > 0 ? bitmap.height / bitmap.width : 1;
  const targetWidth = Math.min(maxWidth, bitmap.width);
  const targetHeight = Math.max(1, Math.round(targetWidth * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9));
  return blob || null;
}

async function writePageWithVariants(chapterDir, pageName, sourceFile) {
  await writeFile(chapterDir, `${pageName}.jpg`, sourceFile);
  for (let i = 0; i < IMAGE_VARIANTS.length; i += 1) {
    const maxWidth = IMAGE_VARIANTS[i];
    try {
      const variantBlob = await createWebpVariant(sourceFile, maxWidth);
      if (variantBlob) {
        await writeFile(chapterDir, `${pageName}-${maxWidth}.webp`, variantBlob);
      }
    } catch (error) {
      console.log('[debug] Variant webp ignoree:', pageName, maxWidth, error);
    }
  }
}

async function deletePageWithVariants(chapterDir, pageName) {
  await deleteFileIfExists(chapterDir, `${pageName}.jpg`);
  for (let i = 0; i < IMAGE_VARIANTS.length; i += 1) {
    await deleteFileIfExists(chapterDir, `${pageName}-${IMAGE_VARIANTS[i]}.webp`);
  }
}

async function clearChapterDirectory(chapterDir) {
  const namesToRemove = [];
  for await (const [name, handle] of chapterDir.entries()) {
    if (handle.kind !== 'file') continue;
    if (/\.(jpe?g|webp)$/i.test(name)) {
      namesToRemove.push(name);
    }
  }
  for (let i = 0; i < namesToRemove.length; i += 1) {
    await deleteFileIfExists(chapterDir, namesToRemove[i]);
  }
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
    await clearChapterDirectory(chapterDir);
    for (let i = 0; i < fileCheck.files.length; i += 1) {
      const pageName = String(i + 1).padStart(2, '0');
      await writePageWithVariants(chapterDir, pageName, fileCheck.files[i]);
    }
    await writeFile(chapterDir, 'cover.jpg', fileCheck.files[0]);

    upsertChapterData(number, title, date, fileCheck.files.length);
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

async function importChapterFolder() {
  if (!projectDirectoryHandle) {
    showMessage('Choisis d abord la racine du projet.', true);
    return;
  }

  const numberInput = document.querySelector('#import-chapter-number');
  const titleInput = document.querySelector('#import-chapter-title');
  const dateInput = document.querySelector('#import-chapter-date');
  const folderInput = document.querySelector('#import-chapter-folder');

  const number = Number.parseInt(String(numberInput?.value || ''), 10);
  const title = String(titleInput?.value || '').trim();
  const date = String(dateInput?.value || '').trim();
  const fileCheck = sanitizeUploadFiles(folderInput?.files);

  if (Number.isNaN(number) || number < 1 || !title || !date) {
    showMessage('Renseigne numero, titre et date valides.', true);
    return;
  }
  if (!fileCheck.ok) {
    showMessage(fileCheck.message, true);
    return;
  }
  if (!fileCheck.files.length) {
    showMessage('Le dossier doit contenir des images jpg/jpeg.', true);
    return;
  }

  try {
    const folder = `chapter-${number}`;
    const chapterDir = await getChapterDir(folder);
    await clearChapterDirectory(chapterDir);

    for (let i = 0; i < fileCheck.files.length; i += 1) {
      const pageName = String(i + 1).padStart(2, '0');
      await writePageWithVariants(chapterDir, pageName, fileCheck.files[i]);
    }
    await writeFile(chapterDir, 'cover.jpg', fileCheck.files[0]);

    upsertChapterData(number, title, date, fileCheck.files.length);
    persistSiteData();
    await writeChaptersJsonToProject();

    selectedChapterNumber = number;
    renderChapterSelect();
    if (numberInput) numberInput.value = '';
    if (titleInput) titleInput.value = '';
    if (dateInput) dateInput.value = '';
    if (folderInput) folderInput.value = '';
    showMessage(`Chapitre ${number} importe avec ${fileCheck.files.length} pages.`);
  } catch (error) {
    console.error('[debug] Erreur import dossier chapitre:', error);
    showMessage('Erreur pendant l import du dossier chapitre.', true);
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
    await writePageWithVariants(chapterDir, String(newPage).padStart(2, '0'), file);
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
      const sourceBase = String(i).padStart(2, '0');
      const destBase = String(i - 1).padStart(2, '0');

      const jpgBlob = await readFileBlob(chapterDir, `${sourceBase}.jpg`);
      await writeFile(chapterDir, `${destBase}.jpg`, jpgBlob);

      for (let v = 0; v < IMAGE_VARIANTS.length; v += 1) {
        const size = IMAGE_VARIANTS[v];
        try {
          const variantBlob = await readFileBlob(chapterDir, `${sourceBase}-${size}.webp`);
          await writeFile(chapterDir, `${destBase}-${size}.webp`, variantBlob);
        } catch {
          await deleteFileIfExists(chapterDir, `${destBase}-${size}.webp`);
        }
      }
    }
    await deletePageWithVariants(chapterDir, String(chapter.pages).padStart(2, '0'));
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
  const importBtn = document.querySelector('#import-chapter-btn');
  const addPageBtn = document.querySelector('#add-page-btn');
  const removePageBtn = document.querySelector('#remove-page-btn');

  select?.addEventListener('change', () => {
    const value = Number.parseInt(select.value, 10);
    selectedChapterNumber = Number.isNaN(value) ? null : value;
    renderSelectedChapterMeta();
  });

  createBtn?.addEventListener('click', createChapter);
  importBtn?.addEventListener('click', importChapterFolder);
  addPageBtn?.addEventListener('click', addPageToSelectedChapter);
  removePageBtn?.addEventListener('click', removePageFromSelectedChapter);
}

async function callAdminApi(path, options = {}) {
  if (!window.Auth || typeof window.Auth.callApi !== 'function') return null;
  try {
    return await window.Auth.callApi(path, options);
  } catch (error) {
    console.log('[debug] admin api error:', path, error);
    return null;
  }
}

function renderModerationRows(container, rows, type) {
  if (!container) return;
  if (!Array.isArray(rows) || !rows.length) {
    container.innerHTML = '<p class="muted">Aucun element.</p>';
    return;
  }
  container.innerHTML = '';
  rows.forEach((row) => {
    const item = document.createElement('article');
    item.className = 'chapter-manager-item';
    const chapterText = row.chapterNumber ? `Chapitre ${row.chapterNumber} | ` : '';
    item.innerHTML = `
      <div>
        <strong>${row.author}</strong>
        <p>${chapterText}${new Date(row.createdAt).toLocaleString('fr-FR')}</p>
        <p>${row.content}</p>
      </div>
      <div class="chapter-manager-actions">
        <button class="btn ghost danger" data-mod-type="${type}" data-mod-id="${row.id}" type="button">Supprimer</button>
      </div>
    `;
    container.appendChild(item);
  });
}

async function refreshModerationPanel() {
  const commentsEl = document.querySelector('#moderation-comments');
  const forumEl = document.querySelector('#moderation-forum');
  const result = await callAdminApi('/mod/overview');
  if (!result?.ok) {
    if (commentsEl) commentsEl.innerHTML = '<p class="muted">Moderation indisponible.</p>';
    if (forumEl) forumEl.innerHTML = '<p class="muted">Moderation indisponible.</p>';
    return;
  }
  const comments = Array.isArray(result.payload?.comments) ? result.payload.comments.slice(0, 25) : [];
  const forum = Array.isArray(result.payload?.forum) ? result.payload.forum.slice(0, 25) : [];
  renderModerationRows(commentsEl, comments, 'comment');
  renderModerationRows(forumEl, forum, 'forum');

  document.querySelectorAll('button[data-mod-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = String(button.dataset.modId || '');
      const type = String(button.dataset.modType || '');
      if (!id || !type) return;
      const path = type === 'comment' ? `/mod/comment/${id}` : `/mod/forum/${id}`;
      const deleted = await callAdminApi(path, { method: 'DELETE' });
      if (!deleted?.ok) {
        showMessage('Suppression moderation echouee.', true);
        return;
      }
      showMessage('Element supprime (moderation).');
      refreshModerationPanel();
    });
  });
}

async function setupModerationPanel() {
  const box = document.querySelector('#moderation-box');
  const refreshBtn = document.querySelector('#moderation-refresh');
  if (!box || !refreshBtn || !window.Auth) return;
  const user = window.Auth.getCurrentUser();
  if (!user?.isAdmin) return;
  const backendUp = await window.Auth.isBackendAvailable();
  if (!backendUp) return;

  box.classList.remove('hidden');
  refreshBtn.addEventListener('click', refreshModerationPanel);
  await refreshModerationPanel();
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
  setupModerationPanel();

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
