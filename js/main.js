// Point d'entree principal pour index.html et reader.html
const DATA_PATH = './data/chapters.json';
const DATA_OVERRIDE_KEY = 'nine_peaks_data_override';
const SITE_DATA_KEY = 'nine_peaks_site_data';
const COMMENTS_KEY = 'nine_peaks_comments';
const FORUM_KEY = 'nine_peaks_forum_messages';

let chaptersCache = [];
let activeChapter = null;
let activePage = 1;
let currentZoom = 1;
let currentMode = 'scroll';
let headerLastY = 0;
let forceHideUi = false;
let resizeRafId = null;

function getReaderContentWidth() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--reader-content-width').trim();
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? 780 : parsed;
}

function applyImageSizing(targetImage = null) {
  const images = targetImage ? [targetImage] : document.querySelectorAll('.page-image');
  const baseWidth = getReaderContentWidth();
  images.forEach((image) => {
    const naturalWidth = Number(image.dataset.naturalWidth || image.naturalWidth || 0);
    if (!naturalWidth) return;
    const renderWidth = Math.min(baseWidth, naturalWidth) * currentZoom;
    image.style.width = `${Math.round(renderWidth)}px`;
  });
}

function clearLegacyDataOverrides() {
  try {
    localStorage.removeItem(DATA_OVERRIDE_KEY);
    localStorage.removeItem(SITE_DATA_KEY);
  } catch {
    // ignore localStorage failures
  }
}

function syncReaderHeaderVisibility() {
  const headerEl = document.querySelector('#reader-header');
  if (!headerEl) return;
  if (forceHideUi) {
    headerEl.classList.add('collapsed');
    return;
  }
  if (currentMode === 'paged') {
    headerEl.classList.remove('collapsed');
  }
}

function stepSinglePage(direction) {
  if (!activeChapter) return;
  if (direction === 'next') {
    activePage = Math.min(activeChapter.pages, activePage + 1);
  } else {
    activePage = Math.max(1, activePage - 1);
  }
  updateSinglePage(activeChapter);
}

function refreshPagedNav() {
  const nav = document.querySelector('#paged-nav');
  const prev = document.querySelector('#single-prev');
  const next = document.querySelector('#single-next');
  if (!nav || !prev || !next || !activeChapter) return;

  const pagedVisible = currentMode === 'paged';
  nav.classList.toggle('hidden', !pagedVisible);
  prev.disabled = !pagedVisible || activePage <= 1;
  next.disabled = !pagedVisible || activePage >= activeChapter.pages;
}

function readCommentsStore() {
  try {
    const raw = localStorage.getItem(COMMENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveCommentsStore(store) {
  localStorage.setItem(COMMENTS_KEY, JSON.stringify(store));
}

function getChapterComments(chapterNumber) {
  const store = readCommentsStore();
  const list = store[String(chapterNumber)];
  return Array.isArray(list) ? list : [];
}

function setChapterComments(chapterNumber, comments) {
  const store = readCommentsStore();
  store[String(chapterNumber)] = comments;
  saveCommentsStore(store);
}

function readForumMessages() {
  try {
    const raw = localStorage.getItem(FORUM_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveForumMessages(messages) {
  localStorage.setItem(FORUM_KEY, JSON.stringify(messages));
}

function getLocalDataOverride() {
  try {
    const siteRaw = localStorage.getItem(SITE_DATA_KEY);
    if (siteRaw) {
      const siteParsed = JSON.parse(siteRaw);
      if (siteParsed && Array.isArray(siteParsed.chapters)) {
        console.log('[debug] Donnees site locales detectees');
        return siteParsed;
      }
    }
  } catch (error) {
    console.log('[debug] Donnees site locales invalides:', error);
  }

  try {
    const raw = localStorage.getItem(DATA_OVERRIDE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.chapters)) return null;
    console.log('[debug] Override local detecte');
    return parsed;
  } catch (error) {
    console.log('[debug] Override local invalide:', error);
    return null;
  }
}

function getCurrentUserSafe() {
  return window.Auth ? window.Auth.getCurrentUser() : null;
}

function getBookmarksKey() {
  const user = getCurrentUserSafe();
  if (!user) return null;
  return `nine_peaks_bookmarks_${user.username}`;
}

function readBookmarks() {
  const key = getBookmarksKey();
  if (!key) return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.log('[debug] Bookmarks invalides:', error);
    return [];
  }
}

function saveBookmarks(items) {
  const key = getBookmarksKey();
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(items));
}

function upsertBookmark(chapterNumber, page, mode) {
  const bookmarks = readBookmarks();
  const existingIndex = bookmarks.findIndex((item) => item.chapter === chapterNumber);
  const nextBookmark = {
    chapter: chapterNumber,
    page,
    mode,
    updatedAt: new Date().toISOString()
  };
  if (existingIndex >= 0) {
    bookmarks[existingIndex] = nextBookmark;
  } else {
    bookmarks.push(nextBookmark);
  }
  saveBookmarks(bookmarks);
}

function removeBookmark(chapterNumber) {
  const next = readBookmarks().filter((item) => item.chapter !== chapterNumber);
  saveBookmarks(next);
}

function getChapterBookmark(chapterNumber) {
  return readBookmarks().find((item) => item.chapter === chapterNumber) || null;
}

async function fetchData() {
  console.log('[debug] Chargement JSON:', DATA_PATH);
  const response = await fetch(DATA_PATH, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Erreur HTTP ${response.status} lors du chargement du JSON`);
  }
  const baseData = await response.json();
  console.log('[debug] JSON charge (source fichier):', baseData);
  return baseData;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function safeText(value, fallback = '') {
  if (typeof value === 'string' && value.trim()) return value;
  return fallback;
}

function chapterLink(chapterNumber, page = 1, mode = 'scroll') {
  return `reader.html?chapter=${chapterNumber}&page=${page}&mode=${mode}`;
}

function createChapterCard(chapter) {
  const article = document.createElement('article');
  article.className = 'chapter-card';
  article.setAttribute('role', 'listitem');

  const coverPath = safeText(chapter.cover, `mangas/nine-peaks/${chapter.folder}/cover.jpg`);
  const thumbWrap = document.createElement('div');
  thumbWrap.className = 'chapter-thumb';

  const thumbImg = document.createElement('img');
  thumbImg.src = coverPath;
  thumbImg.loading = 'lazy';
  thumbImg.alt = `Couverture chapitre ${chapter.number}`;
  thumbImg.addEventListener('error', () => {
    thumbImg.src = 'mangas/nine-peaks/cover.jpg';
  });

  const content = document.createElement('div');
  content.className = 'chapter-content';
  const title = safeText(chapter.title, `Chapitre ${chapter.number}`);
  content.innerHTML = `
    <h3>Chapitre ${chapter.number} - ${title}</h3>
    <div class="chapter-meta">
      <span>${formatDate(chapter.date)}</span>
      <span>${chapter.pages} pages</span>
    </div>
    <p><a class="link-accent" href="${chapterLink(chapter.number)}" aria-label="Lire le chapitre ${chapter.number}">Lire ce chapitre</a></p>
  `;

  thumbWrap.appendChild(thumbImg);
  article.appendChild(thumbWrap);
  article.appendChild(content);
  return article;
}

function renderMangaInfo(manga) {
  const titleEl = document.querySelector('#manga-title');
  const synopsisEl = document.querySelector('#manga-synopsis');
  const coverEl = document.querySelector('#manga-cover');
  const tagsEl = document.querySelector('#manga-tags');
  if (!titleEl || !synopsisEl || !coverEl || !tagsEl) return;

  titleEl.textContent = safeText(manga.title, 'Nine Peaks');
  synopsisEl.textContent = safeText(manga.synopsis, 'Synopsis indisponible.');
  coverEl.src = safeText(manga.cover, 'mangas/nine-peaks/cover.jpg');
  coverEl.alt = `Couverture de ${safeText(manga.title, 'Nine Peaks')}`;
  coverEl.addEventListener('error', () => {
    coverEl.src = 'mangas/nine-peaks/cover.jpg';
  });

  tagsEl.innerHTML = '';
  const genres = Array.isArray(manga.genres) ? manga.genres : [];
  genres.forEach((genre) => {
    const span = document.createElement('span');
    span.className = 'tag';
    span.textContent = genre;
    tagsEl.appendChild(span);
  });
}

function renderUserActions() {
  const actionsEl = document.querySelector('#user-actions');
  if (!actionsEl || !window.Auth) return;
  const user = window.Auth.getCurrentUser();
  if (!user) {
    actionsEl.innerHTML = '<a class="btn ghost" href="login.html">Connexion / Inscription</a>';
    return;
  }

  const adminButton = user.isAdmin ? '<a class="btn ghost" href="admin.html">Panel Admin</a>' : '';
  actionsEl.innerHTML = `
    <span class="user-pill">Connecte: ${user.username}</span>
    ${adminButton}
    <button id="logout-btn" class="btn ghost" type="button">Se deconnecter</button>
  `;

  const logoutBtn = document.querySelector('#logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      window.Auth.logout();
      window.location.reload();
    });
  }
}

function renderBookmarks(chapters) {
  const listEl = document.querySelector('#bookmark-list');
  const emptyEl = document.querySelector('#bookmark-empty');
  if (!listEl || !emptyEl) return;

  const user = getCurrentUserSafe();
  if (!user) {
    listEl.innerHTML = '';
    emptyEl.textContent = 'Connecte-toi pour sauvegarder tes pages favorites.';
    return;
  }

  const bookmarks = readBookmarks().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  if (!bookmarks.length) {
    listEl.innerHTML = '';
    emptyEl.textContent = 'Aucun bookmark pour le moment.';
    return;
  }

  emptyEl.textContent = '';
  listEl.innerHTML = '';
  bookmarks.forEach((bookmark) => {
    const chapter = chapters.find((item) => item.number === bookmark.chapter);
    if (!chapter) return;
    const item = document.createElement('article');
    item.className = 'bookmark-item';
    item.innerHTML = `
      <strong>Chapitre ${chapter.number} - ${safeText(chapter.title, 'Sans titre')}</strong>
      <span>Page ${bookmark.page} - mode ${bookmark.mode === 'paged' ? 'image' : 'defilement'}</span>
      <a class="link-accent" href="${chapterLink(chapter.number, bookmark.page, bookmark.mode)}">Reprendre</a>
    `;
    listEl.appendChild(item);
  });
}

function renderChapterList(chapters) {
  const listEl = document.querySelector('#chapter-list');
  const emptyEl = document.querySelector('#chapter-empty');
  if (!listEl || !emptyEl) return;

  listEl.innerHTML = '';
  if (!chapters.length) {
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  const fragment = document.createDocumentFragment();
  chapters
    .slice()
    .sort((a, b) => b.number - a.number)
    .forEach((chapter) => {
      fragment.appendChild(createChapterCard(chapter));
    });
  listEl.appendChild(fragment);
}

function renderChapterMenu(chapters) {
  const selectEl = document.querySelector('#chapter-jump');
  const openBtn = document.querySelector('#chapter-jump-btn');
  if (!selectEl || !openBtn) return;

  selectEl.innerHTML = '<option value="">Choisir un chapitre...</option>';
  chapters
    .slice()
    .sort((a, b) => b.number - a.number)
    .forEach((chapter) => {
      const option = document.createElement('option');
      option.value = String(chapter.number);
      option.textContent = `Chapitre ${chapter.number} - ${safeText(chapter.title, 'Sans titre')}`;
      selectEl.appendChild(option);
    });

  openBtn.addEventListener('click', () => {
    const selectedNumber = Number.parseInt(selectEl.value, 10);
    if (Number.isNaN(selectedNumber)) return;
    window.location.href = chapterLink(selectedNumber);
  });
}

function showIndexError(message) {
  const errorEl = document.querySelector('#chapter-error');
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

function parseReaderParams() {
  const params = new URLSearchParams(window.location.search);
  const chapter = Number.parseInt(params.get('chapter'), 10);
  const page = Number.parseInt(params.get('page'), 10);
  return {
    chapter: Number.isNaN(chapter) ? null : chapter,
    page: Number.isNaN(page) ? 1 : page,
    mode: 'scroll'
  };
}

function buildImagePath(chapter, pageIndex) {
  const page = String(pageIndex).padStart(2, '0');
  return `mangas/nine-peaks/${chapter.folder}/${page}.jpg`;
}

function updatePageCounter(current, total) {
  const counterEl = document.querySelector('#page-counter');
  if (!counterEl) return;
  counterEl.textContent = `Page ${current} / ${total}`;
}

function enableHeaderCollapse() {
  const headerEl = document.querySelector('#reader-header');
  if (!headerEl) return;
  let ticking = false;
  const onScroll = () => {
    ticking = false;
    if (forceHideUi) {
      headerEl.classList.add('collapsed');
      return;
    }
    if (currentMode !== 'scroll') return;
    const currentY = window.scrollY;
    const scrollingDown = currentY > headerLastY;
    if (scrollingDown && currentY > 120) {
      headerEl.classList.add('collapsed');
    } else {
      headerEl.classList.remove('collapsed');
    }
    headerLastY = currentY;
  };

  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(onScroll);
  }, { passive: true });
}

function setUiVisibilityHidden(hidden) {
  forceHideUi = hidden;
  document.body.classList.toggle('ui-forced-hidden', hidden);
  syncReaderHeaderVisibility();
  const btn = document.querySelector('#ui-visibility-toggle');
  if (!btn) return;
  btn.classList.toggle('active', hidden);
  btn.setAttribute('aria-pressed', hidden ? 'true' : 'false');
  btn.title = hidden ? 'Afficher l interface' : 'Masquer l interface';
}

function setupUiVisibilityToggle() {
  const btn = document.querySelector('#ui-visibility-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    setUiVisibilityHidden(!forceHideUi);
  });
}

function formatCommentDate(isoDate) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate || '';
  return date.toLocaleString('fr-FR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function renderComments(chapterNumber) {
  const listEl = document.querySelector('#comments-list');
  const emptyEl = document.querySelector('#comments-empty');
  const countEl = document.querySelector('#comments-count');
  if (!listEl || !emptyEl || !countEl) return;

  const user = getCurrentUserSafe();
  const comments = getChapterComments(chapterNumber).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  countEl.textContent = `${comments.length} commentaire${comments.length > 1 ? 's' : ''}`;
  if (!comments.length) {
    listEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  listEl.innerHTML = '';

  comments.forEach((comment) => {
    const item = document.createElement('article');
    item.className = 'comment-item';

    const canDelete = user && user.username === comment.author;
    item.innerHTML = `
      <div class="comment-meta">
        <strong>${comment.author}</strong>
        <span>${formatCommentDate(comment.createdAt)}</span>
      </div>
      <p class="comment-content">${comment.content}</p>
      ${canDelete ? `<div class="comment-actions"><button class="btn ghost" data-delete-comment="${comment.id}" type="button">Supprimer</button></div>` : ''}
    `;
    listEl.appendChild(item);
  });

  listEl.querySelectorAll('button[data-delete-comment]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.deleteComment;
      const next = getChapterComments(chapterNumber).filter((comment) => comment.id !== id);
      setChapterComments(chapterNumber, next);
      renderComments(chapterNumber);
    });
  });
}

function setupComments(chapterNumber) {
  const formEl = document.querySelector('#comment-form');
  const inputEl = document.querySelector('#comment-input');
  const submitEl = document.querySelector('#comment-submit');
  const userEl = document.querySelector('#comment-user');
  if (!formEl || !inputEl || !submitEl || !userEl) return;

  const user = getCurrentUserSafe();
  if (!user) {
    submitEl.disabled = true;
    userEl.textContent = 'Connecte-toi pour commenter';
    renderComments(chapterNumber);
    return;
  }

  userEl.textContent = `Connecte: ${user.username}`;
  submitEl.disabled = false;
  renderComments(chapterNumber);

  formEl.addEventListener('submit', (event) => {
    event.preventDefault();
    const content = String(inputEl.value || '').trim();
    if (!content) return;
    if (content.length > 800) return;

    const next = getChapterComments(chapterNumber);
    next.push({
      id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      author: user.username,
      content,
      createdAt: new Date().toISOString()
    });
    setChapterComments(chapterNumber, next);
    inputEl.value = '';
    renderComments(chapterNumber);
  });
}

function renderForum() {
  const listEl = document.querySelector('#forum-list');
  const emptyEl = document.querySelector('#forum-empty');
  if (!listEl || !emptyEl) return;

  const user = getCurrentUserSafe();
  const messages = readForumMessages().slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (!messages.length) {
    listEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  listEl.innerHTML = '';
  messages.forEach((message) => {
    const canDelete = user && user.username === message.author;
    const item = document.createElement('article');
    item.className = 'comment-item';
    item.innerHTML = `
      <div class="comment-meta">
        <strong>${message.author}</strong>
        <span>${formatCommentDate(message.createdAt)}</span>
      </div>
      <p class="comment-content">${message.content}</p>
      ${canDelete ? `<div class="comment-actions"><button class="btn ghost" data-delete-forum="${message.id}" type="button">Supprimer</button></div>` : ''}
    `;
    listEl.appendChild(item);
  });

  listEl.querySelectorAll('button[data-delete-forum]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.deleteForum;
      const next = readForumMessages().filter((message) => message.id !== id);
      saveForumMessages(next);
      renderForum();
    });
  });
}

function setupForum() {
  const formEl = document.querySelector('#forum-form');
  const inputEl = document.querySelector('#forum-input');
  const submitEl = document.querySelector('#forum-submit');
  const userEl = document.querySelector('#forum-user');
  if (!formEl || !inputEl || !submitEl || !userEl) return;

  const user = getCurrentUserSafe();
  renderForum();
  if (!user) {
    submitEl.disabled = true;
    userEl.textContent = 'Connecte-toi pour participer';
    return;
  }

  submitEl.disabled = false;
  userEl.textContent = `Connecte: ${user.username}`;
  formEl.addEventListener('submit', (event) => {
    event.preventDefault();
    const content = String(inputEl.value || '').trim();
    if (!content || content.length > 800) return;
    const next = readForumMessages();
    next.push({
      id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      author: user.username,
      content,
      createdAt: new Date().toISOString()
    });
    saveForumMessages(next);
    inputEl.value = '';
    renderForum();
  });
}

function scrollByViewport(direction) {
  const delta = Math.round(window.innerHeight * 0.9);
  window.scrollBy({
    top: direction === 'down' ? delta : -delta,
    behavior: 'smooth'
  });
}

function setZoom(nextZoom) {
  const clamped = Math.min(2.5, Math.max(0.5, nextZoom));
  currentZoom = clamped;
  document.documentElement.style.setProperty('--reader-zoom', String(clamped));
  const label = document.querySelector('#zoom-level');
  if (label) label.textContent = `${Math.round(clamped * 100)}%`;
  applyImageSizing();
}

function setupReaderResizeHandling() {
  if (document.body.dataset.page !== 'reader') return;
  window.addEventListener('resize', () => {
    if (resizeRafId) {
      window.cancelAnimationFrame(resizeRafId);
    }
    resizeRafId = window.requestAnimationFrame(() => {
      applyImageSizing();
      resizeRafId = null;
    });
  }, { passive: true });
}

function updateSinglePage(chapter) {
  const imageEl = document.querySelector('#single-page-image');
  if (!imageEl) return;
  const safePage = Math.min(Math.max(activePage, 1), chapter.pages);
  activePage = safePage;
  imageEl.src = buildImagePath(chapter, safePage);
  imageEl.alt = `Chapitre ${chapter.number} - Page ${safePage}`;
  imageEl.addEventListener('error', () => {
    imageEl.src = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1300"><rect width="100%" height="100%" fill="#111"/><text x="50%" y="50%" fill="#888" font-size="36" text-anchor="middle" dominant-baseline="middle">Image manquante page ${safePage}</text></svg>`
    );
  }, { once: true });
  updatePageCounter(safePage, chapter.pages);
  refreshPagedNav();
}

function setReaderMode(mode) {
  currentMode = 'scroll';
  const scrollBtn = document.querySelector('#mode-scroll');
  const pagedBtn = document.querySelector('#mode-paged');
  const scrollContainer = document.querySelector('#reader-pages');
  const singleContainer = document.querySelector('#reader-single');
  if (!scrollContainer) return;

  if (scrollBtn) scrollBtn.classList.add('active');
  if (pagedBtn) pagedBtn.classList.remove('active');
  scrollContainer.classList.remove('hidden');
  if (singleContainer) singleContainer.classList.add('hidden');
  syncReaderHeaderVisibility();
  refreshPagedNav();
}

function setupKeyboardNavigation() {
  window.addEventListener('keydown', (event) => {
    if (!activeChapter) return;
    if (currentMode === 'scroll') {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        scrollByViewport('down');
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        scrollByViewport('up');
      }
      return;
    }

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      stepSinglePage('next');
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      stepSinglePage('prev');
    }
  });
}

function setupFloatingButtons() {
  const upBtn = document.querySelector('#page-up');
  const downBtn = document.querySelector('#page-down');
  if (!upBtn || !downBtn) return;

  upBtn.addEventListener('click', () => {
    if (!activeChapter) return;
    if (currentMode === 'scroll') {
      scrollByViewport('up');
      return;
    }
    stepSinglePage('prev');
  });

  downBtn.addEventListener('click', () => {
    if (!activeChapter) return;
    if (currentMode === 'scroll') {
      scrollByViewport('down');
      return;
    }
    stepSinglePage('next');
  });
}

function setupPagedNavButtons() {
  const prevBtn = document.querySelector('#single-prev');
  const nextBtn = document.querySelector('#single-next');
  if (!prevBtn || !nextBtn) return;

  prevBtn.addEventListener('click', () => stepSinglePage('prev'));
  nextBtn.addEventListener('click', () => stepSinglePage('next'));
}

function setupZoomControls() {
  const outBtn = document.querySelector('#zoom-out');
  const inBtn = document.querySelector('#zoom-in');
  const resetBtn = document.querySelector('#zoom-reset');
  if (!outBtn || !inBtn || !resetBtn) return;

  outBtn.addEventListener('click', () => setZoom(currentZoom - 0.1));
  inBtn.addEventListener('click', () => setZoom(currentZoom + 0.1));
  resetBtn.addEventListener('click', () => setZoom(1));
}

function setupModeControls() {
  const scrollBtn = document.querySelector('#mode-scroll');
  const pagedBtn = document.querySelector('#mode-paged');
  if (!scrollBtn && !pagedBtn) return;

  scrollBtn?.addEventListener('click', () => setReaderMode('scroll'));
  pagedBtn?.addEventListener('click', () => setReaderMode('scroll'));
}

function setupBookmarkButton() {
  const btn = document.querySelector('#bookmark-toggle');
  const readerUser = document.querySelector('#reader-user');
  if (!btn || !readerUser || !activeChapter) return;

  const user = getCurrentUserSafe();
  const iconMode = btn.classList.contains('icon-square');
  if (!user) {
    readerUser.textContent = 'Connecte-toi pour les bookmarks';
    btn.disabled = true;
    btn.classList.remove('active');
    btn.title = 'Connexion requise pour bookmark';
    return;
  }

  readerUser.textContent = `Connecte: ${user.username}`;

  function refreshLabel() {
    const bookmark = getChapterBookmark(activeChapter.number);
    if (!bookmark) {
      btn.classList.remove('active');
      btn.title = iconMode ? 'Ajouter bookmark' : 'Ajouter bookmark';
      if (!iconMode) btn.textContent = 'Ajouter bookmark';
      return;
    }
    btn.classList.add('active');
    btn.title = `Bookmark actif page ${bookmark.page}`;
    if (!iconMode) btn.textContent = `Maj bookmark (p.${activePage})`;
  }

  btn.disabled = false;
  refreshLabel();

  btn.addEventListener('click', () => {
    const existing = getChapterBookmark(activeChapter.number);
    if (existing && existing.page === activePage && existing.mode === currentMode) {
      removeBookmark(activeChapter.number);
      btn.classList.remove('active');
      btn.title = 'Ajouter bookmark';
      if (!iconMode) btn.textContent = 'Ajouter bookmark';
      return;
    }
    upsertBookmark(activeChapter.number, activePage, currentMode);
    refreshLabel();
  });
}

function setupChapterButtons(chapters, currentIndex) {
  const prevBtn = document.querySelector('#prev-chapter');
  const nextBtn = document.querySelector('#next-chapter');
  const previousChapter = chapters[currentIndex - 1] || null;
  const nextChapter = chapters[currentIndex + 1] || null;

  if (prevBtn) {
    prevBtn.disabled = !previousChapter;
    prevBtn.addEventListener('click', () => {
      if (previousChapter) {
        window.location.href = chapterLink(previousChapter.number, 1, currentMode);
      }
    });
  }

  if (nextBtn) {
    nextBtn.disabled = !nextChapter;
    nextBtn.addEventListener('click', () => {
      if (nextChapter) {
        window.location.href = chapterLink(nextChapter.number, 1, currentMode);
      }
    });
  }
}

function showReaderState(message, isError = false) {
  const stateEl = document.querySelector('#reader-state');
  if (!stateEl) return;
  stateEl.textContent = message;
  stateEl.classList.toggle('error', isError);
  stateEl.classList.remove('hidden');
}

function hideReaderState() {
  const stateEl = document.querySelector('#reader-state');
  if (!stateEl) return;
  stateEl.classList.add('hidden');
}

function observePages(totalPages) {
  const pageNodes = document.querySelectorAll('.page-frame');
  if (!pageNodes.length) return;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && currentMode === 'scroll') {
          const page = Number.parseInt(entry.target.dataset.page, 10);
          if (!Number.isNaN(page)) {
            activePage = page;
            updatePageCounter(activePage, totalPages);
          }
        }
      });
    },
    { threshold: 0.6 }
  );
  pageNodes.forEach((node) => observer.observe(node));
}

function renderReaderPages(chapter) {
  const pagesContainer = document.querySelector('#reader-pages');
  if (!pagesContainer) return;
  pagesContainer.innerHTML = '';
  const fragment = document.createDocumentFragment();

  for (let pageIndex = 1; pageIndex <= chapter.pages; pageIndex += 1) {
    const figure = document.createElement('figure');
    figure.className = 'page-frame';
    figure.dataset.page = String(pageIndex);

    const image = document.createElement('img');
    image.className = 'page-image';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.alt = `Chapitre ${chapter.number} - Page ${pageIndex}`;
    image.src = buildImagePath(chapter, pageIndex);
    image.addEventListener('load', () => {
      image.dataset.naturalWidth = String(image.naturalWidth || 0);
      applyImageSizing(image);
    });
    image.addEventListener('error', () => {
      console.log('[debug] Image manquante:', image.src);
      image.alt = `Image manquante - chapitre ${chapter.number} page ${pageIndex}`;
      image.src = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1300"><rect width="100%" height="100%" fill="#111"/><text x="50%" y="50%" fill="#888" font-size="36" text-anchor="middle" dominant-baseline="middle">Image manquante page ${pageIndex}</text></svg>`
      );
    });

    figure.appendChild(image);
    fragment.appendChild(figure);
  }
  pagesContainer.appendChild(fragment);

  observePages(chapter.pages);
  updatePageCounter(activePage, chapter.pages);
  applyImageSizing();
}

function setReaderTitle(chapter) {
  const titleEl = document.querySelector('#reader-title');
  if (!titleEl) return;
  titleEl.textContent = `Chapitre ${chapter.number} - ${safeText(chapter.title, 'Sans titre')}`;
  document.title = `${titleEl.textContent} | Nine Peaks VF`;
}

async function initIndexPage() {
  try {
    const data = await fetchData();
    const chapters = Array.isArray(data.chapters) ? data.chapters : [];
    chaptersCache = chapters;
    renderUserActions();
    renderMangaInfo(data.manga || {});
    renderChapterList(chaptersCache);
    renderChapterMenu(chaptersCache);
    renderBookmarks(chaptersCache);
    setupForum();
  } catch (error) {
    console.error('[debug] Erreur index:', error);
    showIndexError('Impossible de charger les chapitres. Verifie data/chapters.json');
  }
}

async function initReaderPage() {
  try {
    const params = parseReaderParams();
    if (!params.chapter) {
      showReaderState('Chapitre introuvable dans l URL. Exemple: reader.html?chapter=25', true);
      return;
    }

    const data = await fetchData();
    const chapters = Array.isArray(data.chapters) ? data.chapters.slice().sort((a, b) => a.number - b.number) : [];
    chaptersCache = chapters;

    const chapterIndex = chapters.findIndex((chapter) => chapter.number === params.chapter);
    if (chapterIndex < 0) {
      showReaderState(`Chapitre ${params.chapter} introuvable.`, true);
      return;
    }

    activeChapter = chapters[chapterIndex];
    activePage = Math.min(Math.max(params.page, 1), activeChapter.pages);
    currentMode = params.mode;
    console.log('[debug] Chapitre actif:', activeChapter, 'mode:', currentMode);

    setReaderTitle(activeChapter);
    setupChapterButtons(chapters, chapterIndex);
    renderReaderPages(activeChapter);
    setReaderMode(currentMode);
    setZoom(0.9);
    setupKeyboardNavigation();
    setupFloatingButtons();
    setupPagedNavButtons();
    setupZoomControls();
    setupModeControls();
    setupBookmarkButton();
    setupComments(activeChapter.number);
    setupUiVisibilityToggle();
    enableHeaderCollapse();
    hideReaderState();
  } catch (error) {
    console.error('[debug] Erreur lecteur:', error);
    showReaderState('Erreur au chargement du lecteur. Consulte la console.', true);
  }
}

function init() {
  const page = document.body.dataset.page;
  console.log('[debug] Initialisation page:', page);
  if (page === 'index' || page === 'reader') {
    clearLegacyDataOverrides();
  }
  if (page === 'index') initIndexPage();
  if (page === 'reader') initReaderPage();
  setupReaderResizeHandling();
}

document.addEventListener('DOMContentLoaded', init);
