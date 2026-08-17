import { renderChart } from '../shared/chart';
import { getAuthStatus, isAuthError } from '../api/authClient';
import { initI18n, applyStaticI18n, onLangChange, t, localeTag } from '../shared/i18n';
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
  pager: $('pager'), prevPage: $('prevPage'), nextPage: $('nextPage'), pageInfo: $('pageInfo'),
  reviewBody: $('reviewBody'), reviewProgress: $('reviewProgress'),
  frequentCard: $('frequentCard'), frequentList: $('frequentList')
};

let stats = [];
let days = 30;
let series = 'both';
let page = 0;
let totalPages = 1;
let searchTimer;

// Черга картки на повторення. Завантажується один раз на сесію: якщо
// перезапитувати після кожної оцінки, слово з оцінкою «again» поверталось би
// у список миттєво й сесія ніколи не закінчувалась би.
let queue = [];
let queueIndex = 0;
let sessionTotal = 0;

init();

async function init() {
  // Мова — до першого рендера: інакше підписи спершу блимнули б українською.
  await initI18n();
  applyStaticI18n(document);
  onLangChange(renderI18n);

  const status = await getAuthStatus();
  const loggedIn = !isAuthError(status) && status.loggedIn;

  els.loggedOut.hidden = loggedIn;
  els.content.hidden = !loggedIn;
  if (!loggedIn) return;

  if (!isAuthError(status) && status.email) els.headerSub.textContent = status.email;

  await Promise.all([loadStats(), loadHistory(), loadReview(), loadFrequent()]);
}

// Перемалювання після зміни мови (її могли перемкнути в popup, поки ця
// вкладка відкрита). Чергу повторень свідомо НЕ перезапитуємо: loadReview()
// зібрав би її заново, і сесія почалася б з початку. Перемальовуємо лише
// поточну картку — вона й так будується з уже завантажених даних.
function renderI18n() {
  applyStaticI18n(document);
  if (stats.length) drawChart();
  loadHistory();
  renderCard();
  loadFrequent();
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
    { key: 'translations', label: t('seriesTranslations'), color: COLORS.translations, values: stats.map((p) => p.translations) },
    { key: 'words', label: t('seriesWordsFull'), color: COLORS.words, values: stats.map((p) => p.savedWords) }
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
    renderEmpty(t('historyLoadFailed'));
    return;
  }

  const { items, totalPages: pages, totalItems } = r.history;
  totalPages = Math.max(1, pages);

  if (items.length === 0) {
    renderEmpty(els.historySearch.value.trim()
      ? t('nothingFound')
      : t('historyEmpty'));
    return;
  }

  els.historyList.textContent = '';
  items.forEach((item) => els.historyList.appendChild(historyRow(item)));

  els.pager.hidden = totalPages <= 1;
  // Номери сторінок — рядками навмисно: форму множини для «записів» задає
  // перший аргумент-число, а ним має бути totalItems, не номер сторінки.
  els.pageInfo.textContent = t('pageInfo', String(page + 1), String(totalPages), totalItems);
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
    link.textContent = t('toVideo');
    meta.appendChild(link);
  }

  row.append(main, meta);
  return row;
}

function modeLabel(mode) {
  if (mode === 'word') return t('modeWord');
  if (mode === 'phrase') return t('modePhrase');
  if (mode === 'sentence') return t('modeSentence');
  return mode;
}

function formatDateTime(iso) {
  try {
    return new Date(iso).toLocaleString(localeTag(),
      { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

// ── Повторення (SRS) ─────────────────────────────────────────────────────────
async function loadReview() {
  const r = await send({ type: MSG.reviewDue, limit: 20 });
  if (!r || r.error || !Array.isArray(r.cards)) {
    renderReviewMessage(t('reviewLoadFailed'));
    return;
  }

  queue = r.cards;
  queueIndex = 0;
  sessionTotal = queue.length;
  renderCard();
}

function renderReviewMessage(text) {
  els.reviewProgress.textContent = '';
  els.reviewBody.textContent = '';
  const empty = document.createElement('div');
  empty.className = 'empty';
  empty.textContent = text;
  els.reviewBody.appendChild(empty);
}

function renderCard() {
  if (queueIndex >= queue.length) {
    renderReviewMessage(sessionTotal > 0
      ? t('reviewDone', sessionTotal)
      : t('reviewEmpty'));
    return;
  }

  const card = queue[queueIndex];
  els.reviewProgress.textContent = t('reviewProgress', String(queueIndex + 1), String(sessionTotal));
  els.reviewBody.textContent = '';

  const wrap = document.createElement('div');
  wrap.className = 'review-card';

  const word = document.createElement('div');
  word.className = 'review-word';
  word.textContent = card.lemma || card.text;
  wrap.appendChild(word);

  if (card.pos) {
    const pos = document.createElement('div');
    pos.className = 'review-pos';
    pos.textContent = card.pos;
    wrap.appendChild(pos);
  }

  // Речення з відео, де слово зустрілось — головна перевага перед звичайною
  // карткою: згадувати доводиться в тому ж контексті, у якому вчив.
  if (card.context) {
    wrap.appendChild(contextEl(card.context, card.text || card.lemma));
  }

  const reveal = document.createElement('button');
  reveal.className = 'btn-primary';
  reveal.style.marginTop = '24px';
  reveal.textContent = t('showTranslation');
  reveal.addEventListener('click', () => revealAnswer(card, wrap, reveal));
  wrap.appendChild(reveal);

  els.reviewBody.appendChild(wrap);
}

// Підсвічуємо слово в реченні, не ламаючи екранування: речення ріжемо на
// частини й збираємо з текстових вузлів, ніде не вставляючи HTML рядком.
function contextEl(context, word) {
  const el = document.createElement('div');
  el.className = 'review-context';

  const idx = word ? context.toLowerCase().indexOf(word.toLowerCase()) : -1;
  if (idx === -1) {
    el.textContent = context;
    return el;
  }

  el.appendChild(document.createTextNode(context.slice(0, idx)));
  const mark = document.createElement('b');
  mark.textContent = context.slice(idx, idx + word.length);
  el.appendChild(mark);
  el.appendChild(document.createTextNode(context.slice(idx + word.length)));
  return el;
}

function revealAnswer(card, wrap, revealBtn) {
  revealBtn.remove();

  const answer = document.createElement('div');
  answer.className = 'review-answer';

  const tr = document.createElement('div');
  tr.className = 'review-translation';
  tr.textContent = card.translation;
  answer.appendChild(tr);

  if (card.example) {
    const ex = document.createElement('div');
    ex.className = 'review-example';
    ex.textContent = card.example;
    answer.appendChild(ex);
  }

  if (card.sourceUrl) {
    const link = document.createElement('a');
    link.className = 'review-source';
    link.href = card.sourceUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = t('whereIMetIt');
    answer.appendChild(link);
  }

  wrap.appendChild(answer);

  const grades = document.createElement('div');
  grades.className = 'grades';
  [
    { grade: 'again', label: t('gradeAgain'), hint: t('gradeAgainHint'), cls: 'grade-again' },
    { grade: 'hard', label: t('gradeHard'), hint: t('gradeHardHint'), cls: '' },
    { grade: 'good', label: t('gradeGood'), hint: t('gradeGoodHint'), cls: '' },
    { grade: 'easy', label: t('gradeEasy'), hint: t('gradeEasyHint'), cls: 'grade-easy' }
  ].forEach((g) => {
    const btn = document.createElement('button');
    btn.className = `grade ${g.cls}`;
    btn.textContent = g.label;
    const small = document.createElement('small');
    small.textContent = g.hint;
    btn.appendChild(small);
    btn.addEventListener('click', () => submitGrade(card, g.grade, grades));
    grades.appendChild(btn);
  });
  wrap.appendChild(grades);
}

async function submitGrade(card, grade, gradesEl) {
  // Блокуємо всі оцінки одразу: подвійний клік інакше оцінив би ще й
  // наступну картку, яку людина навіть не бачила.
  gradesEl.querySelectorAll('button').forEach((b) => { b.disabled = true; });

  const r = await send({ type: MSG.reviewGrade, id: card.id, grade });
  if (!r || r.error) {
    renderReviewMessage(t('gradeSaveFailed'));
    return;
  }

  queueIndex += 1;
  renderCard();
  loadStats(); // повторення — теж активність
}

// ── Часті пошуки ─────────────────────────────────────────────────────────────
async function loadFrequent() {
  const r = await send({ type: MSG.frequentGet, days: 30, min: 3 });
  if (!r || r.error || !Array.isArray(r.frequent) || r.frequent.length === 0) {
    els.frequentCard.hidden = true; // порожній блок гірший за відсутній
    return;
  }

  els.frequentCard.hidden = false;
  els.frequentList.textContent = '';
  r.frequent.forEach((item) => els.frequentList.appendChild(frequentRow(item)));
}

function frequentRow(item) {
  const row = document.createElement('div');
  row.className = 'freq-row';

  const main = document.createElement('div');
  main.className = 'freq-main';

  const word = document.createElement('div');
  word.className = 'freq-word';
  word.textContent = item.text;
  main.appendChild(word);

  const tr = document.createElement('div');
  tr.className = 'freq-tr';
  tr.textContent = item.translation;
  main.appendChild(tr);

  const count = document.createElement('span');
  count.className = 'freq-count';
  count.textContent = `${item.count}×`;

  const save = document.createElement('button');
  save.className = 'freq-save';
  save.textContent = t('freqSave');
  save.addEventListener('click', async () => {
    save.disabled = true;
    save.textContent = t('freqSaving');
    const r = await send({
      type: MSG.saveWord,
      word: item.text,
      translation: item.translation,
      context: null,
      pos: null,
      example: null,
      sourceUrl: item.sourceUrl
    });
    if (r?.error) {
      save.textContent = t('freqFailed');
      save.title = r.error;
      save.disabled = false;
      return;
    }
    save.textContent = t('saveWordDone');
    // Рядок лишається на місці: зникнення під курсором збиває з пантелику.
    // З наступним відкриттям сторінки бекенд його вже відфільтрує.
  });

  row.append(main, count, save);
  return row;
}

// Живий синк: збереження слова на сторінці одразу оновлює графік і показники.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && STORAGE.wordsRevision in changes) loadStats();
});
