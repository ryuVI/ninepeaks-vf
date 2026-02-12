const DATA_PATH = './data/chapters.json';
const SITE_DATA_KEY = 'nine_peaks_site_data';
const LEGACY_OVERRIDE_KEY = 'nine_peaks_data_override';

let projectDirectoryHandle = null;
let siteData = null;
let chapter = null;

function showEditorMessage(text, isError = false) {
  const el = document.querySelector('#editor-message');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('hidden');
  el.classList.toggle('error', isError);
}

function setFolderStatus(text, isError = false) {
  const el = document.querySelector('#editor-folder-status');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('error', isError);
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

function getStoredData() {
  const localRaw = localStorage.getItem(SITE_DATA_KEY);
  const localData = parseJsonOrNull(localRaw);
  if (validateDataShape(localData)) return localData;

  const legacyRaw = localStorage.getItem(LEGACY_OVERRIDE_KEY);
  const legacyData = parseJsonOrNull(legacyRaw);
  if (validateDataShape(legacyData)) return legacyData;

  return null;
}

function persistData() {
  localStorage.setItem(SITE_DATA_KEY, JSON.stringify(siteData));
}

function parseChapterNumber() {
  const params = new URLSearchParams(window.location.search);
  const chapterRaw = params.get('chapter');
  const parsed = Number.parseInt(chapterRaw, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function chapterPagePath(folder, pageNumber) {
  return `mangas/nine-peaks/${folder}/${String(pageNumber).padStart(2, '0')}.jpg`;
}

function refreshHeader() {
  const titleEl = document.querySelector('#editor-title');
  const metaEl = document.querySelector('#editor-meta');
  const readerLink = document.querySelector('#open-reader-link');
  if (!chapter || !titleEl || !metaEl || !readerLink) return;

  titleEl.textContent = `Chapitre ${chapter.number} - ${chapter.title || 'Sans titre'}`;
  metaEl.textContent = `${chapter.pages || 0} pages | Dossier: ${chapter.folder}`;
  readerLink.href = `reader.html?chapter=${chapter.number}`;
}

function renderPages() {
  const listEl = document.querySelector('#editor-pages-list');
  const emptyEl = document.querySelector('#editor-pages-empty');
  if (!listEl || !emptyEl || !chapter) return;

  listEl.innerHTML = '';
  const total = Number(chapter.pages || 0);
  if (!total) {
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  for (let page = 1; page <= total; page += 1) {
    const item = document.createElement('article');
    item.className = 'editor-page-card';
    item.innerHTML = `
      <div class="editor-page-thumb">
        <img src="${chapterPagePath(chapter.folder, page)}" alt="Page ${page}" loading="lazy">
      </div>
      <div class="editor-page-info">
        <strong>Page ${page}</strong>
        <div class="admin-actions">
          <button class="btn ghost danger" data-remove-page="${page}" type="button">Supprimer</button>
        </div>
      </div>
    `;
    listEl.appendChild(item);
  }

  listEl.querySelectorAll('button[data-remove-page]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const page = Number.parseInt(btn.dataset.removePage, 10);
      await removePage(page);
    });
  });
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
    // ignore if not found
  }
}

async function getChapterDir() {
  const mangasDir = await ensureSubDirectory(projectDirectoryHandle, 'mangas');
  const ninePeaksDir = await ensureSubDirectory(mangasDir, 'nine-peaks');
  return ensureSubDirectory(ninePeaksDir, chapter.folder);
}

async function writeChaptersJsonToProject() {
  if (!projectDirectoryHandle) return;
  const dataDir = await ensureSubDirectory(projectDirectoryHandle, 'data');
  const blob = new Blob([JSON.stringify(siteData, null, 2)], { type: 'application/json' });
  await writeFile(dataDir, 'chapters.json', blob);
}

async function syncCoverFromPageOne(chapterDir) {
  if (chapter.pages <= 0) {
    await deleteFileIfExists(chapterDir, 'cover.jpg');
    return;
  }
  const pageOneBlob = await readFileBlob(chapterDir, '01.jpg');
  await writeFile(chapterDir, 'cover.jpg', pageOneBlob);
}

async function addPage() {
  if (!projectDirectoryHandle) {
    showEditorMessage('Choisis d abord le dossier projet.', true);
    return;
  }

  const pageNumberInput = document.querySelector('#editor-add-page-number');
  const fileInput = document.querySelector('#editor-add-file');
  const file = fileInput?.files?.[0];
  if (!file || !/\.(jpe?g)$/i.test(file.name)) {
    showEditorMessage('Selectionne une image jpg/jpeg valide.', true);
    return;
  }

  const currentPages = Number(chapter.pages || 0);
  const wanted = Number.parseInt(String(pageNumberInput?.value || ''), 10);
  const targetPage = Number.isNaN(wanted) ? currentPages + 1 : wanted;
  if (targetPage < 1 || targetPage > currentPages + 1) {
    showEditorMessage(`Numero invalide. Choisis entre 1 et ${currentPages + 1}.`, true);
    return;
  }

  try {
    const chapterDir = await getChapterDir();
    for (let i = currentPages; i >= targetPage; i -= 1) {
      const source = `${String(i).padStart(2, '0')}.jpg`;
      const destination = `${String(i + 1).padStart(2, '0')}.jpg`;
      const blob = await readFileBlob(chapterDir, source);
      await writeFile(chapterDir, destination, blob);
    }

    await writeFile(chapterDir, `${String(targetPage).padStart(2, '0')}.jpg`, file);
    chapter.pages = currentPages + 1;
    chapter.cover = `mangas/nine-peaks/${chapter.folder}/cover.jpg`;
    await syncCoverFromPageOne(chapterDir);

    persistData();
    await writeChaptersJsonToProject();
    if (fileInput) fileInput.value = '';
    if (pageNumberInput) pageNumberInput.value = '';
    refreshHeader();
    renderPages();
    showEditorMessage(`Page ${targetPage} ajoutee avec succes.`);
  } catch (error) {
    console.error('[debug] Erreur add page:', error);
    showEditorMessage('Erreur pendant l ajout de page.', true);
  }
}

async function removePage(targetPageParam) {
  if (!projectDirectoryHandle) {
    showEditorMessage('Choisis d abord le dossier projet.', true);
    return;
  }

  const input = document.querySelector('#editor-remove-page-number');
  const targetPage = targetPageParam || Number.parseInt(String(input?.value || ''), 10);
  const total = Number(chapter.pages || 0);
  if (Number.isNaN(targetPage) || targetPage < 1 || targetPage > total) {
    showEditorMessage(`Numero invalide. Choisis entre 1 et ${total}.`, true);
    return;
  }

  try {
    const chapterDir = await getChapterDir();
    for (let i = targetPage + 1; i <= total; i += 1) {
      const source = `${String(i).padStart(2, '0')}.jpg`;
      const destination = `${String(i - 1).padStart(2, '0')}.jpg`;
      const blob = await readFileBlob(chapterDir, source);
      await writeFile(chapterDir, destination, blob);
    }

    await deleteFileIfExists(chapterDir, `${String(total).padStart(2, '0')}.jpg`);
    chapter.pages = Math.max(0, total - 1);
    await syncCoverFromPageOne(chapterDir);

    persistData();
    await writeChaptersJsonToProject();
    if (input) input.value = '';
    refreshHeader();
    renderPages();
    showEditorMessage(`Page ${targetPage} supprimee.`);
  } catch (error) {
    console.error('[debug] Erreur remove page:', error);
    showEditorMessage('Erreur pendant la suppression de page.', true);
  }
}

function setupEvents() {
  const selectFolderBtn = document.querySelector('#editor-select-folder');
  const addBtn = document.querySelector('#editor-add-page-btn');
  const removeBtn = document.querySelector('#editor-remove-page-btn');

  if (!window.showDirectoryPicker) {
    setFolderStatus('Fonction non supportee ici. Utilise Chrome/Edge recent.', true);
    if (selectFolderBtn) selectFolderBtn.disabled = true;
    if (addBtn) addBtn.disabled = true;
    if (removeBtn) removeBtn.disabled = true;
    return;
  }

  selectFolderBtn?.addEventListener('click', async () => {
    try {
      projectDirectoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      setFolderStatus(`Dossier selectionne: ${projectDirectoryHandle.name}`);
    } catch (error) {
      console.log('[debug] selection dossier annulee', error);
      setFolderStatus('Selection dossier annulee.', true);
    }
  });

  addBtn?.addEventListener('click', addPage);
  removeBtn?.addEventListener('click', async () => {
    await removePage(null);
  });
}

async function initChapterEditor() {
  if (!window.Auth || !window.Auth.requireAdmin()) return;

  const chapterNumber = parseChapterNumber();
  if (!chapterNumber) {
    showEditorMessage('Chapitre invalide dans l URL.', true);
    return;
  }

  const baseData = await loadBaseData();
  siteData = getStoredData() || baseData;
  chapter = siteData.chapters.find((item) => item.number === chapterNumber) || null;
  if (!chapter) {
    showEditorMessage(`Chapitre ${chapterNumber} introuvable.`, true);
    return;
  }

  refreshHeader();
  renderPages();
  setupEvents();
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'chapter-editor') {
    initChapterEditor().catch((error) => {
      console.error('[debug] init chapter editor error:', error);
      showEditorMessage('Erreur au chargement de la page d edition.', true);
    });
  }
});
