import {
  DEFAULT_MODEL, geminiModels, sourceLanguages, targetLanguages
} from '../shared/constants';
import { createDropdown } from '../shared/dropdown';
import {
  initI18n, applyStaticI18n, onLangChange, t, getLang, localeTag, isLang, UI_LANGUAGES
} from '../shared/i18n';
import { login, logout, getAuthStatus, isAuthError } from '../api/authClient';
import { MSG, STORAGE, SETTINGS_KEYS, KEY_SOURCE, touched } from '../shared/messages';

const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);

const els = {
  // settings
  apiKey: $('apiKey'), save: $('save'), status: $('status'),
  // profile
  profileLoggedOut: $('profileLoggedOut'), profileLoggedIn: $('profileLoggedIn'),
  profileLoginBtn: $('profileLoginBtn'), logoutBtn: $('logoutBtn'),
  openDashboard: $('openDashboard'),
  profileAvatar: $('profileAvatar'), profileName: $('profileName'),
  profileEmail: $('profileEmail'), profileSince: $('profileSince'),
  statTotal: $('statTotal'), statWeek: $('statWeek'), statPairs: $('statPairs'),
  // words
  wordsLoggedOut: $('wordsLoggedOut'), wordsLoggedIn: $('wordsLoggedIn'),
  wordSearch: $('wordSearch'), wordsList: $('wordsList'), wordsCount: $('wordsCount'),
  // джерело ключа
  keySource: $('keySource'), ownKeyBlock: $('ownKeyBlock'),
  proxyBlock: $('proxyBlock'), proxyHint: $('proxyHint'), quotaRow: $('quotaRow')
};

// Кастомні дропдауни замість <select> — див. shared/dropdown.ts. Створюються не
// на рівні модуля, а в mountDropdowns(): підказки в списках локалізовані, тож до
// initI18n() вони зібралися б не тією мовою.
const dd = { sourceLang: null, targetLang: null, model: null, uiLang: null };

let loggedIn = false;
let allWords = [];
let authBusy = false;
let activeTab = 'profile';
let keySource = KEY_SOURCE.own;
let createdAtIso = ''; // тримаємо ISO, а не готовий рядок: формат дати залежить від мови

// ── Дропдауни ────────────────────────────────────────────────────────────────
// Перезбирає списки поточною мовою, зберігаючи вибрані значення. Дешевше і
// надійніше, ніж мутувати вже намальовані пункти зсередини dropdown.ts.
function mountDropdowns() {
  const keep = {
    sourceLang: dd.sourceLang?.getValue() ?? 'English',
    targetLang: dd.targetLang?.getValue() ?? 'Ukrainian',
    model: dd.model?.getValue() ?? DEFAULT_MODEL,
    // Мову беремо з i18n, а не з попереднього дропдауна: перемкнути її могли в
    // панелі на сторінці, і тоді старе значення дропдауна вже неправильне.
    uiLang: getLang()
  };

  const mount = (containerId, options, value, ariaKey, onChange) => {
    const container = $(containerId);
    container.textContent = '';
    const widget = createDropdown(options, value, t(ariaKey), onChange);
    container.appendChild(widget.el);
    return widget;
  };

  dd.sourceLang = mount('sourceLangDd', sourceLanguages(), keep.sourceLang, 'labelSourceLang');
  dd.targetLang = mount('targetLangDd', targetLanguages(), keep.targetLang, 'labelTargetLang');
  dd.model = mount('modelDd', geminiModels(), keep.model, 'labelModel');

  // Мова інтерфейсу застосовується одразу, без «Зберегти»: перемикач мови, який
  // нічого не змінює до натискання кнопки, читається як зламаний.
  dd.uiLang = mount('uiLangDd', UI_LANGUAGES, keep.uiLang, 'labelUiLang', applyUiLang);
}

async function applyUiLang(lang) {
  if (!isLang(lang)) return;

  // storage.onChanged підхопить це і в i18n (тут), і в панелі на сторінці,
  // і в дашборді — окремо розсилати нічого не треба.
  await chrome.storage.local.set({ [STORAGE.uiLang]: lang });

  // На акаунт — щоб мова переїхала разом з рештою налаштувань на інший пристрій.
  if (loggedIn) send({ type: MSG.settingsUpdate, settings: { uiLang: lang } });
}

// Перемалювання всього, що вже намальоване. Динамічні частини перечитуються
// звідси ж, бо їхній текст збирається в JS і сам не оновиться.
function renderI18n() {
  applyStaticI18n(document);
  mountDropdowns();
  renderKeySource();
  renderStats();
  renderSince();
  if (activeTab === 'words') renderWords();
  if (keySource === KEY_SOURCE.proxy) loadQuota();
}

// ── Вкладки ──────────────────────────────────────────────────────────────────
document.querySelectorAll('.pp-tab').forEach((tab) => {
  tab.addEventListener('click', () => activateTab(tab.dataset.tab));
});

function activateTab(name) {
  activeTab = name;
  document.querySelectorAll('.pp-tab').forEach((t2) => t2.classList.toggle('active', t2.dataset.tab === name));
  document.querySelectorAll('.pp-panel').forEach((p) => { p.hidden = p.dataset.panel !== name; });
  // Перечитуємо щоразу, а не лише коли список порожній: інакше слово, збережене
  // на сторінці поки popup відкритий, не з'явилося б до повного перевідкриття.
  if (name === 'words' && loggedIn) loadWords();
}

// ── Живий синк ───────────────────────────────────────────────────────────────
// storage.onChanged долітає в усі контексти розширення, тож popup реагує на те,
// що сталося на сторінці (збереження слова) чи в панелі (зміна налаштувань),
// без перезавантаження.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;

  if (STORAGE.wordsRevision in changes && loggedIn) {
    loadWords(); // оновить і список, і статистику профілю
  }
  if (touched(changes, SETTINGS_KEYS)) {
    loadSettingsFromStorage();
  }
  if (touched(changes, [STORAGE.tokens, STORAGE.profile])) {
    refreshAuthState();
  }
});

// ── Ініт ─────────────────────────────────────────────────────────────────────
// Мова — перше, що має бути готове: усе, що малюється нижче, вже враховує її.
main();

async function main() {
  await initI18n();
  applyStaticI18n(document);
  mountDropdowns();
  onLangChange(renderI18n);
  await refreshAuthState();
}

async function refreshAuthState() {
  const status = await getAuthStatus();
  loggedIn = !isAuthError(status) && status.loggedIn;
  toggleSections();

  if (loggedIn) {
    if (!isAuthError(status) && status.email) els.profileEmail.textContent = status.email;
    await loadMe();    // профіль + налаштування з акаунта
    await loadWords(); // одразу: статистика профілю рахується з цього ж списку
  } else {
    allWords = [];
    els.quotaRow.hidden = true; // квота без акаунта не існує
    loadSettingsFromStorage();
  }
  renderKeySource(); // підказка «потрібно увійти» залежить від стану логіну
}

function toggleSections() {
  els.profileLoggedOut.hidden = loggedIn;
  els.profileLoggedIn.hidden = !loggedIn;
  els.wordsLoggedOut.hidden = loggedIn;
  els.wordsLoggedIn.hidden = !loggedIn;
}

// ── Джерело ключа: свій / вбудований (проксі) ────────────────────────────────
els.keySource.querySelectorAll('[data-key-source]').forEach((btn) => {
  btn.addEventListener('click', () => {
    keySource = btn.dataset.keySource;
    renderKeySource();
    if (keySource === KEY_SOURCE.proxy) loadQuota();
  });
});

function renderKeySource() {
  els.keySource.querySelectorAll('[data-key-source]').forEach((b) => {
    b.classList.toggle('active', b.dataset.keySource === keySource);
  });

  const proxy = keySource === KEY_SOURCE.proxy;
  els.ownKeyBlock.hidden = proxy;
  els.proxyBlock.hidden = !proxy;

  // Вбудований ключ потребує акаунта: без логіну нема кого рахувати в квоті.
  if (proxy && !loggedIn) {
    els.proxyHint.textContent = t('proxyHintLoginRequired');
    els.proxyHint.className = 'hint warn';
  } else if (proxy) {
    els.proxyHint.textContent = t('proxyHintOk');
    els.proxyHint.className = 'hint';
  }
}

async function loadQuota() {
  if (!loggedIn) { els.quotaRow.hidden = true; return; }

  const r = await send({ type: MSG.quotaGet });
  if (!r || r.error || !r.quota) { els.quotaRow.hidden = true; return; }

  const q = r.quota;
  els.quotaRow.hidden = false;
  els.quotaRow.textContent = q.enabled
    ? t('quotaLeft', q.remaining, q.limit)
    : t('quotaUnavailable');
}

// ── Профіль + налаштування з бекенду ─────────────────────────────────────────
async function loadMe() {
  const r = await send({ type: MSG.meGet });
  if (!r || r.error) { loadSettingsFromStorage(); return; }
  const me = r.me;

  const name = me.displayName || (me.email ? me.email.split('@')[0] : '');
  els.profileName.textContent = name;
  els.profileEmail.textContent = me.email || '';
  els.profileAvatar.textContent = (name || me.email || '?').charAt(0);
  createdAtIso = me.createdAt || '';
  renderSince();

  // Налаштування: бекенд у пріоритеті, порожні поля добираємо зі storage/дефолту.
  const s = me.settings || {};
  chrome.storage.local.get([...SETTINGS_KEYS], (local) => {
    els.apiKey.value = s.apiKey || local.apiKey || '';
    dd.sourceLang.setValue(s.sourceLang || local.sourceLang || 'English');
    dd.targetLang.setValue(s.targetLang || local.targetLang || 'Ukrainian');
    dd.model.setValue(s.model || local.model || DEFAULT_MODEL);
    keySource = s.keySource || local.keySource || KEY_SOURCE.own;
    renderKeySource();
    if (keySource === KEY_SOURCE.proxy) loadQuota();

    // Мова з акаунта застосовується, лише якщо локально свою ще не обирали:
    // інакше вибір, зроблений щойно на цьому пристрої, перебивався б значенням
    // із сервера при кожному відкритті popup.
    if (!isLang(local[STORAGE.uiLang]) && isLang(s.uiLang)) {
      chrome.storage.local.set({ [STORAGE.uiLang]: s.uiLang });
    }
  });
}

function loadSettingsFromStorage() {
  chrome.storage.local.get([...SETTINGS_KEYS], (data) => {
    if (data.apiKey) els.apiKey.value = data.apiKey;
    if (data.sourceLang) dd.sourceLang.setValue(data.sourceLang);
    if (data.targetLang) dd.targetLang.setValue(data.targetLang);
    dd.model.setValue(data.model || DEFAULT_MODEL);
    if (isLang(data[STORAGE.uiLang])) dd.uiLang.setValue(data[STORAGE.uiLang]);
    keySource = data.keySource || KEY_SOURCE.own;
    renderKeySource();
  });
}

function renderSince() {
  els.profileSince.textContent = createdAtIso ? t('memberSince', formatDate(createdAtIso)) : '';
}

// ── Збереження налаштувань ───────────────────────────────────────────────────
els.save.addEventListener('click', async () => {
  const apiKey = els.apiKey.value.trim();

  // Свій ключ обов'язковий лише в режимі 'own' — у режимі проксі перекладає сервер.
  if (keySource === KEY_SOURCE.own && !apiKey) {
    els.status.textContent = t('settingsApiKeyRequired');
    els.status.className = 'err';
    return;
  }
  if (keySource === KEY_SOURCE.proxy && !loggedIn) {
    els.status.textContent = t('settingsLoginRequired');
    els.status.className = 'err';
    return;
  }

  const settings = {
    apiKey,
    sourceLang: dd.sourceLang.getValue(),
    targetLang: dd.targetLang.getValue(),
    model: dd.model.getValue(),
    keySource,
    uiLang: dd.uiLang.getValue()
  };

  // Локально завжди (background/translate читають саме storage).
  await chrome.storage.local.set(settings);

  if (loggedIn) {
    const r = await send({ type: MSG.settingsUpdate, settings });
    if (r && r.error) {
      els.status.textContent = t('savedLocallyOnly');
      els.status.className = 'err';
      setTimeout(() => { els.status.textContent = ''; }, 2500);
      return;
    }
  }

  els.status.textContent = t('settingsSaved');
  els.status.className = 'ok';
  setTimeout(() => { els.status.textContent = ''; }, 2000);
  if (keySource === KEY_SOURCE.proxy) loadQuota();
});

// ── Слова ────────────────────────────────────────────────────────────────────
async function loadWords() {
  const r = await send({ type: MSG.wordsList });
  if (!r || r.error) {
    // Помилку показуємо, лише якщо користувач саме дивиться на вкладку слів.
    if (activeTab === 'words') {
      els.wordsList.innerHTML = '';
      els.wordsList.appendChild(emptyRow(t('errorWithText', r ? r.error : t('noResponse'))));
    }
    return;
  }
  allWords = r.words || [];
  renderStats();
  if (activeTab === 'words') renderWords();
}

function renderStats() {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const week = allWords.filter((w) => new Date(w.createdAt).getTime() >= weekAgo).length;
  const pairs = new Set(allWords.map((w) => `${w.sourceLang}→${w.targetLang}`));

  els.statTotal.textContent = String(allWords.length);
  els.statWeek.textContent = String(week);
  els.statPairs.textContent = String(pairs.size);
  els.wordsCount.textContent = allWords.length ? t('wordsCount', allWords.length) : '';
}

function renderWords() {
  const q = els.wordSearch.value.trim().toLowerCase();
  const items = allWords
    .filter((w) => !q
      || (w.lemma || '').toLowerCase().includes(q)
      || (w.translation || '').toLowerCase().includes(q))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // найновіші зверху

  els.wordsList.innerHTML = '';
  if (items.length === 0) {
    els.wordsList.appendChild(emptyRow(
      allWords.length === 0 ? t('wordsEmpty') : t('nothingFound')));
    return;
  }

  // textContent (не innerHTML) — переклад/контекст приходять від Gemini, тож
  // ніколи не вставляємо їх як HTML.
  items.forEach((w) => {
    const row = document.createElement('div');
    row.className = 'pp-word';

    const main = document.createElement('div');
    main.className = 'pp-word-main';

    const head = document.createElement('div');
    head.className = 'pp-word-head';

    const lemma = document.createElement('span');
    lemma.className = 'pp-word-lemma';
    lemma.textContent = w.lemma || w.text || '';
    head.appendChild(lemma);

    if (w.pos) {
      const pos = document.createElement('span');
      pos.className = 'pp-word-pos';
      pos.textContent = w.pos;
      head.appendChild(pos);
    }
    main.appendChild(head);

    const tr = document.createElement('div');
    tr.className = 'pp-word-tr';
    tr.textContent = w.translation || '';
    main.appendChild(tr);

    if (w.context) {
      const ctx = document.createElement('div');
      ctx.className = 'pp-word-ctx';
      ctx.textContent = w.context;
      main.appendChild(ctx);
    }

    const del = document.createElement('button');
    del.className = 'pp-word-del';
    del.type = 'button';
    del.textContent = '×';
    del.title = t('deleteTitle');
    del.addEventListener('click', () => removeWord(w.id));

    row.appendChild(main);
    row.appendChild(del);
    els.wordsList.appendChild(row);
  });
}

function emptyRow(text) {
  const el = document.createElement('div');
  el.className = 'pp-empty-sm';
  el.textContent = text;
  return el;
}

async function removeWord(id) {
  // Оптимістично прибираємо з UI; воркер інкрементує wordsRevision, і слухач
  // storage перечитає справжній стан (заодно поверне слово, якщо DELETE впав).
  allWords = allWords.filter((w) => w.id !== id);
  renderStats();
  renderWords();
  await send({ type: MSG.wordsDelete, id });
}

els.wordSearch.addEventListener('input', renderWords);

// Дашборд — окрема вкладка: графік із фільтрами й довга історія у 360px popup
// не вміщаються. chrome.tabs.create не потребує дозволу "tabs".
els.openDashboard.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
});

// ── Логін / логаут ───────────────────────────────────────────────────────────
els.profileLoginBtn.addEventListener('click', doAuth);
els.logoutBtn.addEventListener('click', doAuth);

async function doAuth() {
  if (authBusy) return;
  authBusy = true;

  // Popup закривається, щойно Google відкриває своє вікно — тому await може не
  // дочекатись. Логін усе одно завершується у воркері; при наступному відкритті
  // popup стан підхопиться.
  try {
    const result = loggedIn ? await logout() : await login();
    if (!isAuthError(result)) await refreshAuthState();
  } catch {
    /* popup міг закритися — стан підхопиться при наступному відкритті */
  } finally {
    authBusy = false;
  }
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(localeTag(), { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return '';
  }
}
