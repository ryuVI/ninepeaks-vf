// Point d'entree principal pour index.html et reader.html
const DATA_PATH = './data/chapters.json';

let chaptersCache = [];
let activeChapter = null;
let activePage = 1;
let headerLastY = 0;

async function fetchData() {
  console.log('[debug] Chargement JSON:', DATA_PATH);
  const response = await fetch(DATA_PATH, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Erreur HTTP ${response.status} lors du chargement du JSON`);
  }
  const data = await response.json();
  console.log('[debug] JSON charge:', data);
  return data;
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

function createChapterCard(chapter) {
  const article = document.createElement('article');
  article.className = 'chapter-card';
  article.setAttribute('role', 'listitem');

  const title = safeText(chapter.title, `Chapitre ${chapter.number}`);
  article.innerHTML = `
    <h3>Chapitre ${chapter.number} - ${title}</h3>
    <div class="chapter-meta">
      <span>${formatDate(chapter.date)}</span>
      <span>${chapter.pages} pages</span>
    </div>
    <p><a class="link-accent" href="reader.html?chapter=${chapter.number}" aria-label="Lire le chapitre ${chapter.number}">Lire ce chapitre</a></p>
  `;

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

  tagsEl.innerHTML = '';
  const genres = Array.isArray(manga.genres) ? manga.genres : [];
  genres.forEach((genre) => {
    const span = document.createElement('span');
    span.className = 'tag';
    span.textContent = genre;
    tagsEl.appendChild(span);
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

  chapters
    .slice()
    .sort((a, b) => b.number - a.number)
    .forEach((chapter) => {
      listEl.appendChild(createChapterCard(chapter));
    });
}

function showIndexError(message) {
  const errorEl = document.querySelector('#chapter-error');
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

function parseChapterNumber() {
  const params = new URLSearchParams(window.location.search);
  const chapterParam = params.get('chapter');
  const parsed = Number.parseInt(chapterParam, 10);
  if (Number.isNaN(parsed)) return null;
  return parsed;
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

  window.addEventListener('scroll', () => {
    const currentY = window.scrollY;
    const scrollingDown = currentY > headerLastY;
    if (scrollingDown && currentY > 120) {
      headerEl.classList.add('collapsed');
    } else {
      headerEl.classList.remove('collapsed');
    }
    headerLastY = currentY;
  });
}

function scrollByViewport(direction) {
  const delta = Math.round(window.innerHeight * 0.9);
  window.scrollBy({
    top: direction === 'down' ? delta : -delta,
    behavior: 'smooth'
  });
}

function setupKeyboardNavigation() {
  window.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      scrollByViewport('down');
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      scrollByViewport('up');
    }
  });
}

function setupFloatingButtons() {
  const upBtn = document.querySelector('#page-up');
  const downBtn = document.querySelector('#page-down');
  if (upBtn) upBtn.addEventListener('click', () => scrollByViewport('up'));
  if (downBtn) downBtn.addEventListener('click', () => scrollByViewport('down'));
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
        window.location.href = `reader.html?chapter=${previousChapter.number}`;
      }
    });
  }

  if (nextBtn) {
    nextBtn.disabled = !nextChapter;
    nextBtn.addEventListener('click', () => {
      if (nextChapter) {
        window.location.href = `reader.html?chapter=${nextChapter.number}`;
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
        if (entry.isIntersecting) {
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

    image.addEventListener('error', () => {
      console.log('[debug] Image manquante:', image.src);
      figure.classList.add('missing');
      image.alt = `Image manquante - chapitre ${chapter.number} page ${pageIndex}`;
      image.src = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1300"><rect width="100%" height="100%" fill="#111"/><text x="50%" y="50%" fill="#888" font-size="36" text-anchor="middle" dominant-baseline="middle">Image manquante page ${pageIndex}</text></svg>`
      );
    });

    figure.appendChild(image);
    pagesContainer.appendChild(figure);
  }

  updatePageCounter(1, chapter.pages);
  observePages(chapter.pages);
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
    renderMangaInfo(data.manga || {});
    renderChapterList(chaptersCache);
  } catch (error) {
    console.error('[debug] Erreur index:', error);
    showIndexError('Impossible de charger les chapitres. Verifie data/chapters.json');
  }
}

async function initReaderPage() {
  try {
    const chapterNumber = parseChapterNumber();
    if (!chapterNumber) {
      showReaderState('Chapitre introuvable dans l URL. Exemple: reader.html?chapter=25', true);
      return;
    }

    const data = await fetchData();
    const chapters = Array.isArray(data.chapters) ? data.chapters.slice().sort((a, b) => a.number - b.number) : [];
    chaptersCache = chapters;

    const chapterIndex = chapters.findIndex((chapter) => chapter.number === chapterNumber);
    if (chapterIndex < 0) {
      showReaderState(`Chapitre ${chapterNumber} introuvable.`, true);
      return;
    }

    activeChapter = chapters[chapterIndex];
    console.log('[debug] Chapitre actif:', activeChapter);

    setReaderTitle(activeChapter);
    setupChapterButtons(chapters, chapterIndex);
    renderReaderPages(activeChapter);
    setupKeyboardNavigation();
    setupFloatingButtons();
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
  if (page === 'index') {
    initIndexPage();
  }
  if (page === 'reader') {
    initReaderPage();
  }
}

document.addEventListener('DOMContentLoaded', init);
