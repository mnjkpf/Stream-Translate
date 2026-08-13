// Subtitle Translator — in-page панель налаштувань + кнопка в плеєрі
// (§2, CLAUDE_CODE_BRIEF_YT_FIXES.md). Платформо-незалежний модуль: кнопку й
// панель створює content-script, місце вставки кнопки в UI плеєра делегує
// адаптеру сайту через опційний хук adapter.placeSettingsButton() — якщо
// адаптер його не реалізує, кнопки в плеєрі немає, лишається popup.
//
// Панель — дзеркало полів popup.html: пише в ті самі ключі chrome.storage.local
// (apiKey, sourceLang, targetLang, model), тому налаштування, збережені тут
// чи в popup, завжди узгоджені між собою.

import { adapter } from '../adapters/activeAdapter';
import { MESSAGES } from '../../shared/i18n';
import { relocateFloatingUI } from './ui';
import {
  DEFAULT_MODEL, GEMINI_MODELS, SOURCE_LANGUAGES, TARGET_LANGUAGES
} from '../../shared/constants';
import { createDropdown, type Dropdown } from '../../shared/dropdown';
import { login, logout, getAuthStatus, isAuthError, type AuthResult } from '../../api/authClient';
import { MSG, STORAGE, SETTINGS_KEYS, KEY_SOURCE, touched } from '../../shared/messages';

const SETTINGS_BUTTON_ID = 'subtr-settings-btn';
const SETTINGS_PANEL_ID = 'subtr-settings';

interface SettingsFields {
  apiKey: HTMLInputElement;
  sourceLang: Dropdown;
  targetLang: Dropdown;
  model: Dropdown;
  save: HTMLButtonElement;
  status: HTMLElement;
  acctStatus: HTMLElement;
  acctBtn: HTMLButtonElement;
  keySourceSeg: HTMLElement;
  ownKeyBlock: HTMLElement;
  proxyBlock: HTMLElement;
  proxyHint: HTMLElement;
}

// Джерело ключа: 'own' — ключ користувача, 'proxy' — серверний через бекенд.
// Дзеркалить перемикач у popup; обидва пишуть у той самий ключ storage,
// тому стан завжди узгоджений між панеллю і popup.
let keySource: string = KEY_SOURCE.own;

// true, поки триває login/logout — щоб не запустити другий флоу подвійним кліком.
let authBusy = false;

let panelEl: HTMLElement | null = null;
let fields: SettingsFields | null = null;

function buildPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.id = SETTINGS_PANEL_ID;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', MESSAGES.settingsPanelAriaLabel);

  panel.innerHTML = `
    <div class="subtr-settings-head">Subtitle Translator</div>
    <div class="subtr-account">
      <span id="subtr-acct-status" class="subtr-acct-status"></span>
      <button type="button" id="subtr-acct-btn" class="subtr-acct-btn"></button>
    </div>
    <label>Ключ Gemini</label>
    <div class="subtr-seg" id="subtr-set-keySource">
      <button type="button" class="subtr-seg-btn active" data-key-source="own">Свій ключ</button>
      <button type="button" class="subtr-seg-btn" data-key-source="proxy">Вбудований</button>
    </div>
    <div id="subtr-set-ownKey">
      <label for="subtr-set-apiKey">API Key</label>
      <input type="password" id="subtr-set-apiKey" autocomplete="off" placeholder="AIza...">
    </div>
    <div id="subtr-set-proxy" hidden>
      <div class="subtr-proxy-hint" id="subtr-set-proxyHint"></div>
    </div>
    <label>Мова субтитрів</label>
    <div id="subtr-set-sourceLang"></div>
    <label>Перекладати на</label>
    <div id="subtr-set-targetLang"></div>
    <label>Модель Gemini</label>
    <div id="subtr-set-model"></div>
    <button type="button" id="subtr-set-save">Зберегти</button>
    <div id="subtr-set-status"></div>
  `;

  document.body.appendChild(panel);

  // Кастомні дропдауни (shared/dropdown.ts) монтуємо в порожні контейнери:
  // нативний <select> малює список засобами ОС і не піддається стилізації.
  const sourceLang = createDropdown(SOURCE_LANGUAGES, 'English', 'Мова субтитрів');
  const targetLang = createDropdown(TARGET_LANGUAGES, 'Ukrainian', 'Перекладати на');
  const model = createDropdown(GEMINI_MODELS, DEFAULT_MODEL, 'Модель Gemini');
  panel.querySelector('#subtr-set-sourceLang')!.appendChild(sourceLang.el);
  panel.querySelector('#subtr-set-targetLang')!.appendChild(targetLang.el);
  panel.querySelector('#subtr-set-model')!.appendChild(model.el);

  fields = {
    apiKey: panel.querySelector('#subtr-set-apiKey')!,
    sourceLang,
    targetLang,
    model,
    save: panel.querySelector('#subtr-set-save')!,
    status: panel.querySelector('#subtr-set-status')!,
    acctStatus: panel.querySelector('#subtr-acct-status')!,
    acctBtn: panel.querySelector('#subtr-acct-btn')!,
    keySourceSeg: panel.querySelector('#subtr-set-keySource')!,
    ownKeyBlock: panel.querySelector('#subtr-set-ownKey')!,
    proxyBlock: panel.querySelector('#subtr-set-proxy')!,
    proxyHint: panel.querySelector('#subtr-set-proxyHint')!
  };

  fields.keySourceSeg.querySelectorAll<HTMLElement>('[data-key-source]').forEach((btn) => {
    btn.addEventListener('click', () => {
      keySource = btn.dataset.keySource!;
      renderKeySource();
    });
  });

  // Стартовий стан акаунта тягнемо з воркера (той читає токени зі storage).
  getAuthStatus().then(renderAuth);
  fields.acctBtn.addEventListener('click', onAuthButtonClick);

  loadFieldsFromStorage();

  fields.save.addEventListener('click', async () => {
    const apiKey = fields!.apiKey.value.trim();
    const authStatus = await getAuthStatus();
    const loggedIn = !isAuthError(authStatus) && authStatus.loggedIn;

    // Свій ключ обов'язковий лише в режимі 'own' — у режимі проксі перекладає сервер.
    if (keySource === KEY_SOURCE.own && !apiKey) {
      fields!.status.textContent = MESSAGES.settingsApiKeyRequired;
      fields!.status.className = 'err';
      return;
    }
    if (keySource === KEY_SOURCE.proxy && !loggedIn) {
      fields!.status.textContent = MESSAGES.settingsLoginRequired;
      fields!.status.className = 'err';
      return;
    }

    const settings = {
      apiKey,
      sourceLang: fields!.sourceLang.getValue(),
      targetLang: fields!.targetLang.getValue(),
      model: fields!.model.getValue(),
      keySource
    };

    // Локально завжди (background читає саме storage при кожному перекладі).
    await chrome.storage.local.set(settings);

    // Залогінений — дублюємо на акаунт, інакше панель і popup розійшлися б:
    // popup зберігає на бекенд, і при наступному логіні звідти прийшло б старе значення.
    if (loggedIn) {
      await chrome.runtime.sendMessage({ type: MSG.settingsUpdate, settings });
    }

    fields!.status.textContent = MESSAGES.settingsSaved;
    fields!.status.className = 'ok';
    setTimeout(() => { fields!.status.textContent = ''; }, 2000);
  });

  // Закриття: клік поза панеллю (і не по кнопці, яка й так тогглить панель)
  document.addEventListener('mousedown', (e) => {
    if (!panel.classList.contains('visible')) return;
    if (panel.contains(e.target as Node)) return;
    if ((e.target as HTMLElement).closest('#' + SETTINGS_BUTTON_ID)) return;
    closeSettingsPanel();
  });

  // Закриття: Esc
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('visible')) {
      closeSettingsPanel();
    }
  });

  return panel;
}

function loadFieldsFromStorage(): void {
  chrome.storage.local.get([...SETTINGS_KEYS], (data) => {
    if (!fields) return;
    if (data.apiKey) fields.apiKey.value = data.apiKey;
    if (data.sourceLang) fields.sourceLang.setValue(data.sourceLang);
    if (data.targetLang) fields.targetLang.setValue(data.targetLang);
    fields.model.setValue(data.model || DEFAULT_MODEL); // M-6: значення, а не лише placeholder
    keySource = data.keySource || KEY_SOURCE.own;
    renderKeySource();
  });
}

// Показує потрібний блок під перемикачем. Вбудований ключ вимагає акаунта:
// без логіну сервер не має кого рахувати в денній квоті.
function renderKeySource(): void {
  if (!fields) return;

  fields.keySourceSeg.querySelectorAll<HTMLElement>('[data-key-source]').forEach((b) => {
    b.classList.toggle('active', b.dataset.keySource === keySource);
  });

  const proxy = keySource === KEY_SOURCE.proxy;
  fields.ownKeyBlock.hidden = proxy;
  fields.proxyBlock.hidden = !proxy;

  if (!proxy) return;

  getAuthStatus().then((status) => {
    if (!fields) return;
    const loggedIn = !isAuthError(status) && status.loggedIn;
    fields.proxyHint.textContent = loggedIn
      ? 'Переклад іде через сервер — власний ключ не потрібен.'
      : 'Потрібно увійти — вбудований ключ доступний лише з акаунтом.';
    fields.proxyHint.className = loggedIn ? 'subtr-proxy-hint' : 'subtr-proxy-hint warn';
  });
}

// Живий синк: chrome.storage.onChanged долітає в усі контексти розширення, тож
// зміни, зроблені в popup (або на іншому пристрої після логіну), одразу
// підхоплюються цією панеллю — без перезавантаження сторінки.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !fields) return;

  if (touched(changes, SETTINGS_KEYS)) loadFieldsFromStorage();

  // Логін/логаут (у popup чи в іншій вкладці) міняє токени -> перемальовуємо
  // блок акаунта, щоб панель не показувала застарілий стан.
  if (touched(changes, [STORAGE.tokens, STORAGE.profile])) {
    getAuthStatus().then(renderAuth);
  }
});

// Малює стан акаунта в панелі. Приймає як AuthStatus, так і {error} — на помилку
// показуємо як «не увійдено», щоб панель завжди мала визначений стан.
function renderAuth(result: AuthResult): void {
  if (!fields) return;
  authBusy = false;
  fields.acctBtn.disabled = false;

  const loggedIn = !isAuthError(result) && result.loggedIn;
  fields.acctBtn.dataset.loggedIn = loggedIn ? '1' : '0'; // джерело правди для onAuthButtonClick
  if (loggedIn) {
    const email = (result as { email: string | null }).email;
    fields.acctStatus.textContent = email ? MESSAGES.accountLoggedIn(email) : '';
    fields.acctBtn.textContent = MESSAGES.accountLogoutBtn;
  } else {
    fields.acctStatus.textContent = MESSAGES.accountLoggedOut;
    fields.acctBtn.textContent = MESSAGES.accountLoginBtn;
  }
}

async function onAuthButtonClick(): Promise<void> {
  if (!fields || authBusy) return;
  authBusy = true;
  fields.acctBtn.disabled = true;
  fields.acctBtn.textContent = MESSAGES.accountBusy;

  // Поточний стан визначає дію: увійдено -> logout, інакше -> login.
  const wasLoggedIn = fields.acctBtn.dataset.loggedIn === '1';

  try {
    const result = wasLoggedIn ? await logout() : await login();
    if (isAuthError(result)) {
      fields.acctStatus.textContent = MESSAGES.accountLoginFailed;
      // Після помилки перечитуємо реальний стан (login міг частково пройти).
      renderAuth(await getAuthStatus());
      return;
    }
    fields.acctBtn.dataset.loggedIn = result.loggedIn ? '1' : '0';
    renderAuth(result);
  } catch (err) {
    fields.acctStatus.textContent = MESSAGES.accountLoginFailed;
    console.warn('[Subtitle Translator] auth action failed:', err);
    renderAuth(await getAuthStatus());
  }
}

export function toggleSettingsPanel(): void {
  if (!panelEl) panelEl = buildPanel();

  if (panelEl.classList.contains('visible')) {
    closeSettingsPanel();
  } else {
    // Той самий механізм, що переносить tooltip/кнопку SRT у fullscreen-
    // корінь (C-1, ui.ts) — панель додана в getFloatingElements() там же.
    relocateFloatingUI();
    panelEl.classList.add('visible');
  }
}

export function closeSettingsPanel(): void {
  if (panelEl) panelEl.classList.remove('visible');
}

// ui.ts: relocateFloatingUI() переносить і панель налаштувань разом з
// tooltip/кнопкою SRT при вході/виході з fullscreen (панель створюється
// лише лениво, при першому відкритті, тому лишається null до того).
export function getSettingsPanelEl(): HTMLElement | null {
  return panelEl;
}

// ═══════════════════════════════════════════════════════════
// Кнопка в панелі плеєра (§2.3.B)
// ═══════════════════════════════════════════════════════════
function createSettingsButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.id = SETTINGS_BUTTON_ID;
  btn.type = 'button';
  btn.setAttribute('aria-label', MESSAGES.settingsButtonLabel);
  btn.title = MESSAGES.settingsButtonLabel;
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/>'
    + '<path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSettingsPanel();
  });
  return btn;
}

// §2.3.C: YouTube перебудовує панель керування — перевіряємо наявність і
// за потреби переінжектимо ідемпотентно (без дублікатів за id).
export function ensureSettingsButton(): void {
  if (!adapter.placeSettingsButton) return; // хук не реалізовано адаптером — кнопки в плеєрі нема
  if (document.getElementById(SETTINGS_BUTTON_ID)) return; // вже вставлена

  // Кнопка в плеєрі — НЕкритична фіча. Її збій не має валити init() у main.ts
  // (раніше NotFoundError з insertBefore зупиняв усю ініціалізацію: без
  // субтитрів, слухачів і навігації). Тому будь-яка помилка тут — лише лог.
  try {
    adapter.placeSettingsButton(createSettingsButton());
  } catch (err) {
    console.warn('[Subtitle Translator] settings button placement failed:', err);
  }
}
