const DATA_PATH = './data/chapters.json';
const SITE_DATA_KEY = 'nine_peaks_site_data';
const LEGACY_OVERRIDE_KEY = 'nine_peaks_data_override';

let projectDirectoryHandle = null;
let currentData = null;

function showMessage(id, text, isError = false) {
  const el = document.querySelector(id);
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

function setChapterInData(chapterRecord) {
  const index = currentData.chapters.findIndex((chapter) => chapter.number === chapterRecord.number);
  if (index >= 0) {
    currentData.chapters[index] = chapterRecord;
  } else {
    currentData.chapters.push(chapterRecord);
  }
  sortChapters();
  persistSiteData();
}

function removeChapterFromData(chapterNumber) {
  const before = currentData.chapters.length;
  currentData.chapters = currentData.chapters.filter((chapter) => chapter.number !== chapterNumber);
  if (before === currentData.chapters.length) return false;
  persistSiteData();
  return true;
}

function fillQuickForms(data) {
  const manga = data.manga || {};
  const chapters = Array.isArray(data.chapters) ? data.chapters : [];
  const lastChapter = chapters.slice().sort((a, b) => b.number - a.number)[0];

  const titleInput = document.querySelector('#quick-manga-title');
  const coverInput = document.querySelector('#quick-manga-cover');
  const synopsisInput = document.querySelector('#quick-manga-synopsis');
  const genresInput = document.querySelector('#quick-manga-genres');
  const chapterNumber = document.querySelector('#quick-chapter-number');
  const chapterTitle = document.querySelector('#quick-chapter-title');
  const chapterDate = document.querySelector('#quick-chapter-date');
  const chapterPages = document.querySelector('#quick-chapter-pages');
  const chapterFolder = document.querySelector('#quick-chapter-folder');
  const chapterCover = document.querySelector('#quick-chapter-cover');

  if (titleInput) titleInput.value = manga.title || '';
  if (coverInput) coverInput.value = manga.cover || '';
  if (synopsisInput) synopsisInput.value = manga.synopsis || '';
  if (genresInput) genresInput.value = Array.isArray(manga.genres) ? manga.genres.join(', ') : '';

  if (lastChapter) {
    if (chapterNumber) chapterNumber.value = String(lastChapter.number || '');
    if (chapterTitle) chapterTitle.value = lastChapter.title || '';
    if (chapterDate) chapterDate.value = lastChapter.date || '';
    if (chapterPages) chapterPages.value = String(lastChapter.pages || '');
    if (chapterFolder) chapterFolder.value = lastChapter.folder || '';
    if (chapterCover) chapterCover.value = lastChapter.cover || '';
  }
}

function prefillChapterFormFromRecord(chapter) {
  const chapterNumberInput = document.querySelector('#quick-chapter-number');
  const chapterTitleInput = document.querySelector('#quick-chapter-title');
  const chapterDateInput = document.querySelector('#quick-chapter-date');
  const chapterPagesInput = document.querySelector('#quick-chapter-pages');
  const chapterFolderInput = document.querySelector('#quick-chapter-folder');
  const chapterCoverInput = document.querySelector('#quick-chapter-cover');

  if (chapterNumberInput) chapterNumberInput.value = String(chapter.number);
  if (chapterTitleInput) chapterTitleInput.value = chapter.title || '';
  if (chapterDateInput) chapterDateInput.value = chapter.date || '';
  if (chapterPagesInput) chapterPagesInput.value = String(chapter.pages || 1);
  if (chapterFolderInput) chapterFolderInput.value = chapter.folder || '';
  if (chapterCoverInput) chapterCoverInput.value = chapter.cover || '';
}

function renderChapterManagerList() {
  const listEl = document.querySelector('#chapter-manager-list');
  if (!listEl) return;

  listEl.innerHTML = '';
  if (!currentData.chapters.length) {
    listEl.innerHTML = '<p class="muted">Aucun chapitre pour le moment.</p>';
    return;
  }

  currentData.chapters
    .slice()
    .sort((a, b) => b.number - a.number)
    .forEach((chapter) => {
      const item = document.createElement('article');
      item.className = 'chapter-manager-item';
      item.innerHTML = `
        <div>
          <strong>Chapitre ${chapter.number} - ${chapter.title || 'Sans titre'}</strong>
          <p class="muted">Date: ${chapter.date || '-'} | Pages: ${chapter.pages || 0}</p>
        </div>
        <div class="chapter-manager-actions">
          <button class="btn ghost" data-action="edit" data-number="${chapter.number}" type="button">Editer</button>
          <button class="btn ghost danger" data-action="delete" data-number="${chapter.number}" type="button">Supprimer</button>
        </div>
      `;
      listEl.appendChild(item);
    });

  listEl.querySelectorAll('button[data-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const number = Number.parseInt(btn.dataset.number, 10);
      const chapter = currentData.chapters.find((item) => item.number === number);
      if (!chapter) return;
      prefillChapterFormFromRecord(chapter);
      showMessage('#admin-message', `Chapitre ${number} charge dans le formulaire.`);
    });
  });

  listEl.querySelectorAll('button[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const number = Number.parseInt(btn.dataset.number, 10);
      const ok = removeChapterFromData(number);
      if (!ok) {
        showMessage('#admin-message', `Chapitre ${number} introuvable.`, true);
        return;
      }
      renderChapterManagerList();
      showMessage('#admin-message', `Chapitre ${number} supprime.`);
    });
  });
}

function setupQuickActions() {
  const applyMangaBtn = document.querySelector('#apply-manga');
  const prefillPathsBtn = document.querySelector('#prefill-chapter-paths');
  const applyChapterBtn = document.querySelector('#apply-chapter');
  const removeChapterBtn = document.querySelector('#remove-chapter');
  const resetDataBtn = document.querySelector('#reset-data');

  const mangaTitleInput = document.querySelector('#quick-manga-title');
  const mangaCoverInput = document.querySelector('#quick-manga-cover');
  const mangaSynopsisInput = document.querySelector('#quick-manga-synopsis');
  const mangaGenresInput = document.querySelector('#quick-manga-genres');

  const chapterNumberInput = document.querySelector('#quick-chapter-number');
  const chapterTitleInput = document.querySelector('#quick-chapter-title');
  const chapterDateInput = document.querySelector('#quick-chapter-date');
  const chapterPagesInput = document.querySelector('#quick-chapter-pages');
  const chapterFolderInput = document.querySelector('#quick-chapter-folder');
  const chapterCoverInput = document.querySelector('#quick-chapter-cover');

  applyMangaBtn?.addEventListener('click', () => {
    currentData.manga.title = String(mangaTitleInput?.value || '').trim();
    currentData.manga.cover = String(mangaCoverInput?.value || '').trim();
    currentData.manga.synopsis = String(mangaSynopsisInput?.value || '').trim();
    currentData.manga.genres = String(mangaGenresInput?.value || '')
      .split(',')
      .map((genre) => genre.trim())
      .filter(Boolean);
    persistSiteData();
    showMessage('#admin-message', 'Infos manga mises a jour.');
  });

  prefillPathsBtn?.addEventListener('click', () => {
    const number = Number.parseInt(String(chapterNumberInput?.value || ''), 10);
    if (Number.isNaN(number) || number < 1) {
      showMessage('#admin-message', 'Renseigne un numero de chapitre valide.', true);
      return;
    }
    const folder = `chapter-${number}`;
    if (chapterFolderInput && !chapterFolderInput.value.trim()) {
      chapterFolderInput.value = folder;
    }
    if (chapterCoverInput && !chapterCoverInput.value.trim()) {
      chapterCoverInput.value = `mangas/nine-peaks/${folder}/cover.jpg`;
    }
    showMessage('#admin-message', 'Paths chapitre pre-remplis.');
  });

  applyChapterBtn?.addEventListener('click', () => {
    const number = Number.parseInt(String(chapterNumberInput?.value || ''), 10);
    const pages = Number.parseInt(String(chapterPagesInput?.value || ''), 10);
    const title = String(chapterTitleInput?.value || '').trim();
    const date = String(chapterDateInput?.value || '').trim();
    const folder = String(chapterFolderInput?.value || '').trim();
    const cover = String(chapterCoverInput?.value || '').trim();

    if (Number.isNaN(number) || number < 1) {
      showMessage('#admin-message', 'Numero de chapitre invalide.', true);
      return;
    }
    if (Number.isNaN(pages) || pages < 1) {
      showMessage('#admin-message', 'Nombre de pages invalide.', true);
      return;
    }
    if (!title || !date || !folder) {
      showMessage('#admin-message', 'Renseigne titre, date et dossier du chapitre.', true);
      return;
    }

    setChapterInData({
      number,
      title,
      date,
      pages,
      folder,
      cover: cover || `mangas/nine-peaks/${folder}/cover.jpg`
    });
    renderChapterManagerList();
    showMessage('#admin-message', `Chapitre ${number} ajoute/mis a jour.`);
  });

  removeChapterBtn?.addEventListener('click', () => {
    const number = Number.parseInt(String(chapterNumberInput?.value || ''), 10);
    if (Number.isNaN(number) || number < 1) {
      showMessage('#admin-message', 'Numero de chapitre invalide.', true);
      return;
    }
    const ok = removeChapterFromData(number);
    if (!ok) {
      showMessage('#admin-message', `Chapitre ${number} introuvable.`, true);
      return;
    }
    renderChapterManagerList();
    showMessage('#admin-message', `Chapitre ${number} supprime.`);
  });

  resetDataBtn?.addEventListener('click', async () => {
    resetSiteDataStorage();
    try {
      currentData = await loadBaseData();
      fillQuickForms(currentData);
      renderChapterManagerList();
      showMessage('#admin-message', 'Retour aux donnees de base effectue.');
    } catch (error) {
      console.error('[debug] Erreur reset data:', error);
      showMessage('#admin-message', 'Impossible de recharger les donnees de base.', true);
    }
  });
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

async function writeChapterImagesToProject(chapterNumber, files) {
  const mangasDir = await ensureSubDirectory(projectDirectoryHandle, 'mangas');
  const ninePeaksDir = await ensureSubDirectory(mangasDir, 'nine-peaks');
  const chapterFolder = `chapter-${chapterNumber}`;
  const chapterDir = await ensureSubDirectory(ninePeaksDir, chapterFolder);

  for (let index = 0; index < files.length; index += 1) {
    const pageNumber = String(index + 1).padStart(2, '0');
    await writeFile(chapterDir, `${pageNumber}.jpg`, files[index]);
  }
  await writeFile(chapterDir, 'cover.jpg', files[0]);
  return chapterFolder;
}

async function writeChaptersJsonToProject() {
  if (!projectDirectoryHandle) return;
  const dataDir = await ensureSubDirectory(projectDirectoryHandle, 'data');
  const blob = new Blob([JSON.stringify(currentData, null, 2)], { type: 'application/json' });
  await writeFile(dataDir, 'chapters.json', blob);
}

function setupDirectUpload() {
  const selectFolderBtn = document.querySelector('#select-project-folder');
  const uploadBtn = document.querySelector('#upload-chapter-btn');
  const numberInput = document.querySelector('#upload-chapter-number');
  const titleInput = document.querySelector('#upload-chapter-title');
  const dateInput = document.querySelector('#upload-chapter-date');
  const filesInput = document.querySelector('#upload-chapter-files');

  if (!selectFolderBtn || !uploadBtn || !numberInput || !titleInput || !dateInput || !filesInput) return;

  if (!window.showDirectoryPicker) {
    setUploadStatus('Upload direct non supporte ici. Utilise Chrome/Edge recent.', true);
    selectFolderBtn.disabled = true;
    uploadBtn.disabled = true;
    return;
  }

  selectFolderBtn.addEventListener('click', async () => {
    try {
      projectDirectoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      setUploadStatus(`Dossier selectionne: ${projectDirectoryHandle.name}`);
    } catch (error) {
      console.log('[debug] Selection dossier annulee:', error);
      setUploadStatus('Selection dossier annulee.', true);
    }
  });

  uploadBtn.addEventListener('click', async () => {
    if (!projectDirectoryHandle) {
      setUploadStatus('Choisis d abord le dossier de ton projet.', true);
      return;
    }

    const number = Number.parseInt(String(numberInput.value || ''), 10);
    const title = String(titleInput.value || '').trim();
    const date = String(dateInput.value || '').trim();
    const fileCheck = sanitizeUploadFiles(filesInput.files);

    if (Number.isNaN(number) || number < 1 || !title || !date) {
      setUploadStatus('Renseigne numero, titre et date valides.', true);
      return;
    }
    if (!fileCheck.ok || !fileCheck.files.length) {
      setUploadStatus(fileCheck.ok ? 'Ajoute au moins une image.' : fileCheck.message, true);
      return;
    }

    try {
      setUploadStatus('Upload en cours...');
      const folder = await writeChapterImagesToProject(number, fileCheck.files);

      setChapterInData({
        number,
        title,
        date,
        pages: fileCheck.files.length,
        folder,
        cover: `mangas/nine-peaks/${folder}/cover.jpg`
      });

      await writeChaptersJsonToProject();
      renderChapterManagerList();
      setUploadStatus(`Chapitre ${number} upload termine (${fileCheck.files.length} pages).`);
      showMessage('#admin-message', `Chapitre ${number} ajoute avec succes.`);
    } catch (error) {
      console.error('[debug] Erreur upload:', error);
      setUploadStatus('Echec upload. Verifie les permissions dossier.', true);
    }
  });
}

async function initAdminPage() {
  if (!window.Auth || !window.Auth.requireAdmin()) return;

  try {
    const baseData = await loadBaseData();
    const stored = readStoredData();
    currentData = stored || baseData;
    fillQuickForms(currentData);
    renderChapterManagerList();
    showMessage('#admin-message', stored ? 'Donnees locales chargees.' : 'Donnees de base chargees.');
  } catch (error) {
    console.error('[debug] Erreur chargement admin:', error);
    showMessage('#admin-message', 'Impossible de charger les donnees.', true);
    return;
  }

  setupQuickActions();
  setupDirectUpload();

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
