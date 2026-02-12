const DATA_PATH = './data/chapters.json';
const DATA_OVERRIDE_KEY = 'nine_peaks_data_override';

let projectDirectoryHandle = null;

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

function readEditorData(editor) {
  const parsed = parseJsonOrNull(editor.value);
  if (!parsed || !validateDataShape(parsed)) {
    showMessage('#admin-message', 'JSON invalide. Verifie le format { manga, chapters[] }.', true);
    return null;
  }
  return parsed;
}

function writeEditorData(editor, data) {
  editor.value = JSON.stringify(data, null, 2);
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

function setupQuickActions(editor) {
  const applyMangaBtn = document.querySelector('#apply-manga');
  const prefillPathsBtn = document.querySelector('#prefill-chapter-paths');
  const applyChapterBtn = document.querySelector('#apply-chapter');
  const removeChapterBtn = document.querySelector('#remove-chapter');

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

  if (applyMangaBtn) {
    applyMangaBtn.addEventListener('click', () => {
      const data = readEditorData(editor);
      if (!data) return;

      data.manga.title = String(mangaTitleInput?.value || '').trim();
      data.manga.cover = String(mangaCoverInput?.value || '').trim();
      data.manga.synopsis = String(mangaSynopsisInput?.value || '').trim();
      data.manga.genres = String(mangaGenresInput?.value || '')
        .split(',')
        .map((genre) => genre.trim())
        .filter(Boolean);

      writeEditorData(editor, data);
      showMessage('#admin-message', 'Infos manga appliquees dans le JSON.');
    });
  }

  if (prefillPathsBtn) {
    prefillPathsBtn.addEventListener('click', () => {
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
  }

  if (applyChapterBtn) {
    applyChapterBtn.addEventListener('click', () => {
      const data = readEditorData(editor);
      if (!data) return;

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

      const nextChapter = {
        number,
        title,
        date,
        pages,
        folder,
        cover: cover || `mangas/nine-peaks/${folder}/cover.jpg`
      };

      const idx = data.chapters.findIndex((chapter) => chapter.number === number);
      if (idx >= 0) {
        data.chapters[idx] = nextChapter;
        showMessage('#admin-message', `Chapitre ${number} mis a jour dans le JSON.`);
      } else {
        data.chapters.push(nextChapter);
        showMessage('#admin-message', `Chapitre ${number} ajoute dans le JSON.`);
      }

      data.chapters.sort((a, b) => a.number - b.number);
      writeEditorData(editor, data);
    });
  }

  if (removeChapterBtn) {
    removeChapterBtn.addEventListener('click', () => {
      const data = readEditorData(editor);
      if (!data) return;
      const number = Number.parseInt(String(chapterNumberInput?.value || ''), 10);
      if (Number.isNaN(number) || number < 1) {
        showMessage('#admin-message', 'Numero de chapitre invalide.', true);
        return;
      }
      const before = data.chapters.length;
      data.chapters = data.chapters.filter((chapter) => chapter.number !== number);
      if (data.chapters.length === before) {
        showMessage('#admin-message', `Chapitre ${number} introuvable dans le JSON.`, true);
        return;
      }
      writeEditorData(editor, data);
      showMessage('#admin-message', `Chapitre ${number} supprime du JSON.`);
    });
  }
}

function sanitizeUploadFiles(fileList) {
  const files = Array.from(fileList || []);
  const sorted = files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const invalid = sorted.find((file) => !/\.(jpe?g)$/i.test(file.name));
  if (invalid) {
    return {
      ok: false,
      message: `Format non supporte: ${invalid.name}. Utilise uniquement .jpg/.jpeg`
    };
  }
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

async function writeChaptersJsonToProject(data) {
  const dataDir = await ensureSubDirectory(projectDirectoryHandle, 'data');
  const jsonBlob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  await writeFile(dataDir, 'chapters.json', jsonBlob);
}

function setupDirectUpload(editor) {
  const selectFolderBtn = document.querySelector('#select-project-folder');
  const uploadBtn = document.querySelector('#upload-chapter-btn');
  const numberInput = document.querySelector('#upload-chapter-number');
  const titleInput = document.querySelector('#upload-chapter-title');
  const dateInput = document.querySelector('#upload-chapter-date');
  const filesInput = document.querySelector('#upload-chapter-files');

  if (!selectFolderBtn || !uploadBtn || !numberInput || !titleInput || !dateInput || !filesInput) return;

  if (!window.showDirectoryPicker) {
    setUploadStatus('Ton navigateur ne supporte pas cet upload direct. Utilise Chrome ou Edge recent.', true);
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

    const chapterNumber = Number.parseInt(String(numberInput.value || ''), 10);
    const chapterTitle = String(titleInput.value || '').trim();
    const chapterDate = String(dateInput.value || '').trim();
    const fileCheck = sanitizeUploadFiles(filesInput.files);

    if (Number.isNaN(chapterNumber) || chapterNumber < 1) {
      setUploadStatus('Numero de chapitre invalide.', true);
      return;
    }
    if (!chapterTitle) {
      setUploadStatus('Titre chapitre obligatoire.', true);
      return;
    }
    if (!chapterDate) {
      setUploadStatus('Date chapitre obligatoire.', true);
      return;
    }
    if (!fileCheck.ok) {
      setUploadStatus(fileCheck.message, true);
      return;
    }
    if (!fileCheck.files.length) {
      setUploadStatus('Ajoute au moins une image.', true);
      return;
    }

    const data = readEditorData(editor);
    if (!data) return;

    try {
      setUploadStatus('Upload en cours...');
      const folder = await writeChapterImagesToProject(chapterNumber, fileCheck.files);
      const chapterRecord = {
        number: chapterNumber,
        title: chapterTitle,
        date: chapterDate,
        pages: fileCheck.files.length,
        folder,
        cover: `mangas/nine-peaks/${folder}/cover.jpg`
      };

      const index = data.chapters.findIndex((chapter) => chapter.number === chapterNumber);
      if (index >= 0) {
        data.chapters[index] = chapterRecord;
      } else {
        data.chapters.push(chapterRecord);
      }
      data.chapters.sort((a, b) => a.number - b.number);

      await writeChaptersJsonToProject(data);
      writeEditorData(editor, data);

      setUploadStatus(`Chapitre ${chapterNumber} upload avec ${fileCheck.files.length} pages.`);
      showMessage('#admin-message', `Chapitre ${chapterNumber} ajoute et data/chapters.json mis a jour.`);
    } catch (error) {
      console.error('[debug] Erreur upload direct:', error);
      setUploadStatus('Echec upload. Verifie permissions dossier et essaie encore.', true);
    }
  });
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
    writeEditorData(editor, dataToEdit);
    fillQuickForms(dataToEdit);
    showMessage('#admin-message', overrideData ? 'Override local charge.' : 'JSON officiel charge.');
  } catch (error) {
    console.error('[debug] Erreur chargement admin:', error);
    showMessage('#admin-message', 'Impossible de charger data/chapters.json', true);
  }

  setupQuickActions(editor);
  setupDirectUpload(editor);

  saveBtn.addEventListener('click', () => {
    const parsed = readEditorData(editor);
    if (!parsed) return;
    setOverrideData(JSON.stringify(parsed));
    showMessage('#admin-message', 'Sauvegarde locale effectuee.');
  });

  resetBtn.addEventListener('click', async () => {
    resetOverrideData();
    try {
      const baseData = await loadBaseData();
      writeEditorData(editor, baseData);
      fillQuickForms(baseData);
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
  if (document.body.dataset.page === 'admin') {
    initAdminPage();
  }
}

document.addEventListener('DOMContentLoaded', initAdminFeatures);
