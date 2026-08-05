import { DEFAULT_MODEL } from '../shared/constants';
import { login, logout, getAuthStatus, isAuthError } from '../api/authClient';
import { MSG, STORAGE, SETTINGS_KEYS, touched } from '../shared/messages';

const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);

const els = {
  // settings
  apiKey: $('apiKey'), sourceLang: $('sourceLang'), targetLang: $('targetLang'),
  model: $('model'), save: $('save'), status: $('status'),
  // profile
  profileLoggedOut: $('profileLoggedOut'), profileLoggedIn: $('profileLoggedIn'),
  profileLoginBtn: $('profileLoginBtn'), logoutBtn: $('logoutBtn'),
  profileAvatar: $('profileAvatar'), profileName: $('profileName'),
  profileEmail: $('profileEmail'), profileSince: $('profileSince'),
  statTotal: $('statTotal'), statWeek: $('statWeek'), statPairs: $('statPairs'),
  // words
  wordsLoggedOut: $('wordsLoggedOut'), wordsLoggedIn: $('wordsLoggedIn'),
  wordSearch: $('wordSearch'), wordsList: $('wordsList'), wordsCount: $('wordsCount')
};

let loggedIn = false;
let allWords = [];
let authBusy = false;
let activeTab = 'profile';

// ── Вкладки ──────────────────────────────────────────────────────────────────
document.querySelectorAll('.pp-tab').forEach((tab) => {
  tab.addEventListener('click', () => activateTab(tab.dataset.tab));
});

function activateTab(name) {
  activeTab = name;
  document.querySelectorAll('.pp-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
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
refreshAuthState();

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
    loadSettingsFromStorage();
  }
}

function toggleSections() {
  els.profileLoggedOut.hidden = loggedIn;
  els.profileLoggedIn.hidden = !loggedIn;
  els.wordsLoggedOut.hidden = loggedIn;
  els.wordsLoggedIn.hidden = !loggedIn;
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
  els.profileSince.textContent = me.createdAt ? `На сервісі з ${formatDate(me.createdAt)}` : '';

  // Налаштування: бекенд у пріоритеті, порожні поля добираємо зі storage/дефолту.
  const s = me.settings || {};
  chrome.storage.local.get([...SETTINGS_KEYS], (local) => {
    els.apiKey.value = s.apiKey || local.apiKey || '';
    els.sourceLang.value = s.sourceLang || local.sourceLang || 'English';
    els.targetLang.value = s.targetLang || local.targetLang || 'Ukrainian';
    els.model.value = s.model || local.model || DEFAULT_MODEL;
  });
}

function loadSettingsFromStorage() {
  chrome.storage.local.get([...SETTINGS_KEYS], (data) => {
    if (data.apiKey) els.apiKey.value = data.apiKey;
    if (data.sourceLang) els.sourceLang.value = data.sourceLang;
    if (data.targetLang) els.targetLang.value = data.targetLang;
    els.model.value = data.model || DEFAULT_MODEL;
  });
}

// ── Збереження налаштувань ───────────────────────────────────────────────────
els.save.addEventListener('click', async () => {
  const apiKey = els.apiKey.value.trim();
  if (!apiKey) {
    els.status.textContent = 'Введіть API ключ';
    els.status.className = 'err';
    return;
  }

  const settings = {
    apiKey,
    sourceLang: els.sourceLang.value,
    targetLang: els.targetLang.value,
    model: els.model.value.trim() || DEFAULT_MODEL
  };

  // Локально завжди (background/translate читають саме storage).
  await chrome.storage.local.set(settings);

  if (loggedIn) {
    const r = await send({ type: MSG.settingsUpdate, settings });
    if (r && r.error) {
      els.status.textContent = 'Збережено локально (бекенд недоступний)';
      els.status.className = 'err';
      setTimeout(() => { els.status.textContent = ''; }, 2500);
      return;
    }
  }

  els.status.textContent = '✓ Збережено';
  els.status.className = 'ok';
  setTimeout(() => { els.status.textContent = ''; }, 2000);
});

// ── Слова ────────────────────────────────────────────────────────────────────
async function loadWords() {
  const r = await send({ type: MSG.wordsList });
  if (!r || r.error) {
    // Помилку показуємо, лише якщо користувач саме дивиться на вкладку слів.
    if (activeTab === 'words') {
      els.wordsList.innerHTML = '';
      els.wordsList.appendChild(emptyRow(`Помилка: ${r ? r.error : 'немає відповіді'}`));
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
  els.wordsCount.textContent = allWords.length ? `${allWords.length} слів` : '';
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
      allWords.length === 0 ? 'Немає збережених слів' : 'Нічого не знайдено'));
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
    del.title = 'Видалити';
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
    return new Date(iso).toLocaleDateString('uk-UA', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return '';
  }
}
