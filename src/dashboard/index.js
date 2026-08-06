import { renderChart } from '../shared/chart';
import { getAuthStatus, isAuthError } from '../api/authClient';
import { MSG, STORAGE } from '../shared/messages';

const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);

const COLORS = { translations: '#818cf8', words: '#34d399' };

const els = {
  loggedOut: $('loggedOut'), content: $('content'), headerSub: $('headerSub'),
  totalTranslations: $('totalTranslations'), totalWords: $('totalWords'),
  activeDays: $('activeDays'), bestStreak: $('bestStreak'),
  periodFilter: $('periodFilter'), seriesFilter: $('seriesFilter'),
  chart: $('chart'), legend: $('legend'),
  historySearch: $('historySearch'), historyList: $('historyList'),
  pager: $('pager'), prevPage: $('prevPage'), nextPage: $('nextPage'), pageInfo: $('pageInfo')
};

let stats = [];
let days = 30;
let series = 'both';
let page = 0;
let totalPages = 1;
let searchTimer;

init();

async function init() {
  const status = await getAuthStatus();
  const loggedIn = !isAuthError(status) && status.loggedIn;

  els.loggedOut.hidden = loggedIn;
  els.content.hidden = !loggedIn;
  if (!loggedIn) return;

  if (!isAuthError(status) && status.email) els.headerSub.textContent = status.email;

  await Promise.all([loadStats(), loadHistory()]);
}

// ── Фільтри ──────────────────────────────────────────────────────────────────
els.periodFilter.querySelectorAll('[data-days]').forEach((btn) => {
  btn.addEventListener('click', () => {
    days = Number(btn.dataset.days);
    setActive(els.periodFilter, btn);
    loadStats();
  });
});

els.seriesFilter.querySelectorAll('[data-series]').forEach((btn) => {
  btn.addEventListener('click', () => {
    series = btn.dataset.series;
    setActive(els.seriesFilter, btn);
    drawChart(); // фільтр серій не змінює дані — перемальовуємо без запиту
  });
});

function setActive(group, active) {
  group.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b === active));
}

// ── Статистика ───────────────────────────────────────────────────────────────
async function loadStats() {
  const r = await send({ type: MSG.statsGet, days });
  if (!r || r.error || !r.stats) return;
  stats = r.stats;
  renderTotals();
  drawChart();
}

function renderTotals() {
  const translations = stats.reduce((sum, p) => sum + p.translations, 0);
  const words = stats.reduce((sum, p) => sum + p.savedWords, 0);
  const active = stats.filter((p) => p.translations > 0 || p.savedWords > 0).length;

  els.totalTranslations.textContent = String(translations);
  els.totalWords.textContent = String(words);
  els.activeDays.textContent = String(active);
  els.bestStreak.textContent = String(longestStreak());
}

// Найдовша серія поспіль активних днів — рахуємо по вже завантажених точках,
// тому «серія» обмежена обраним періодом (за 7 днів більше 7 бути не може).
function longestStreak() {
  let best = 0;
  let current = 0;
  for (const p of stats) {
    if (p.translations > 0 || p.savedWords > 0) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return best;
}

function drawChart() {
  const all = [
    { key: 'translations', label: 'Переклади', color: COLORS.translations, values: stats.map((p) => p.translations) },
    { key: 'words', label: 'Збережені слова', color: COLORS.words, values: stats.map((p) => p.savedWords) }
  ];
  const shown = series === 'both' ? all : all.filter((s) => s.key === series);

  renderChart(els.chart, { labels: stats.map((p) => p.date), series: shown });

  els.legend.textContent = '';
  shown.forEach((s) => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = s.color;
    const label = document.createElement('span');
    label.textContent = s.label;
    item.append(dot, label);
    els.legend.appendChild(item);
  });
}

// Перемальовуємо при зміні розміру вікна: SVG рахує геометрію від clientWidth,
// тож без цього після ресайзу графік лишився б у старому масштабі.
window.addEventListener('resize', () => { if (stats.length) drawChart(); });

// ── Історія ──────────────────────────────────────────────────────────────────
els.historySearch.addEventListener('input', () => {
  clearTimeout(searchTimer);
  // Дебаунс: без нього кожна літера — окремий запит до бекенду.
  searchTimer = setTimeout(() => { page = 0; loadHistory(); }, 300);
});

els.prevPage.addEventListener('click', () => { if (page > 0) { page -= 1; loadHistory(); } });
els.nextPage.addEventListener('click', () => { if (page + 1 < totalPages) { page += 1; loadHistory(); } });

async function loadHistory() {
  const r = await send({ type: MSG.historyList, query: els.historySearch.value.trim(), page });
  if (!r || r.error || !r.history) {
    renderEmpty('Не вдалося завантажити історію');
    return;
  }

  const { items, totalPages: pages, totalItems } = r.history;
  totalPages = Math.max(1, pages);

  if (items.length === 0) {
    renderEmpty(els.historySearch.value.trim()
      ? 'Нічого не знайдено'
      : 'Історія порожня — перекладіть слово у відео, і воно з’явиться тут');
    return;
  }

  els.historyList.textContent = '';
  items.forEach((item) => els.historyList.appendChild(historyRow(item)));

  els.pager.hidden = totalPages <= 1;
  els.pageInfo.textContent = `Сторінка ${page + 1} з ${totalPages} · ${totalItems} записів`;
  els.prevPage.disabled = page === 0;
  els.nextPage.disabled = page + 1 >= totalPages;
}

function renderEmpty(text) {
  els.historyList.textContent = '';
  const empty = document.createElement('div');
  empty.className = 'empty';
  empty.textContent = text;
  els.historyList.appendChild(empty);
  els.pager.hidden = true;
}

// textContent скрізь — текст приходить від Gemini й від користувача,
// вставляти його як HTML не можна.
function historyRow(item) {
  const row = document.createElement('div');
  row.className = 'hist-row';

  const main = document.createElement('div');
  main.className = 'hist-main';

  const head = document.createElement('div');
  head.className = 'hist-head';

  const text = document.createElement('span');
  text.className = 'hist-text';
  text.textContent = item.text;
  head.appendChild(text);

  const badge = document.createElement('span');
  badge.className = 'hist-badge';
  badge.textContent = modeLabel(item.mode);
  head.appendChild(badge);

  const langs = document.createElement('span');
  langs.className = 'hist-badge';
  langs.textContent = `${item.sourceLang} → ${item.targetLang}`;
  head.appendChild(langs);

  main.appendChild(head);

  const tr = document.createElement('div');
  tr.className = 'hist-tr';
  tr.textContent = item.translation;
  main.appendChild(tr);

  const meta = document.createElement('div');
  meta.className = 'hist-meta';
  const when = document.createElement('div');
  when.textContent = formatDateTime(item.createdAt);
  meta.appendChild(when);

  if (item.sourceUrl) {
    const link = document.createElement('a');
    link.href = item.sourceUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'До відео';
    meta.appendChild(link);
  }

  row.append(main, meta);
  return row;
}

function modeLabel(mode) {
  if (mode === 'word') return 'слово';
  if (mode === 'phrase') return 'фраза';
  if (mode === 'sentence') return 'речення';
  return mode;
}

function formatDateTime(iso) {
  try {
    return new Date(iso).toLocaleString('uk-UA',
      { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

// Живий синк: збереження слова на сторінці одразу оновлює графік і показники.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && STORAGE.wordsRevision in changes) loadStats();
});
