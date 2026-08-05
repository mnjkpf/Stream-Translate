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
import { DEFAULT_MODEL } from '../../shared/constants';
import { login, logout, getAuthStatus, isAuthError, type AuthResult } from '../../api/authClient';
import { MSG, STORAGE, SETTINGS_KEYS, touched } from '../../shared/messages';

const SETTINGS_BUTTON_ID = 'subtr-settings-btn';
const SETTINGS_PANEL_ID = 'subtr-settings';

interface SettingsFields {
  apiKey: HTMLInputElement;
  sourceLang: HTMLSelectElement;
  targetLang: HTMLSelectElement;
  model: HTMLInputElement;
  save: HTMLButtonElement;
  status: HTMLElement;
  acctStatus: HTMLElement;
  acctBtn: HTMLButtonElement;
}

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
    <label for="subtr-set-apiKey">Gemini API Key</label>
    <input type="password" id="subtr-set-apiKey" autocomplete="off" placeholder="AIza...">
    <label for="subtr-set-sourceLang">Мова субтитрів</label>
    <select id="subtr-set-sourceLang">
      <option value="English">English</option>
      <option value="Russian">Російська</option>
      <option value="Spanish">Іспанська</option>
      <option value="French">Французька</option>
      <option value="German">Німецька</option>
    </select>
    <label for="subtr-set-targetLang">Перекладати на</label>
    <select id="subtr-set-targetLang">
      <option value="Ukrainian">Українська</option>
      <option value="Russian">Російська</option>
      <option value="English">Англійська</option>
    </select>
    <label for="subtr-set-model">Gemini модель</label>
    <input type="text" id="subtr-set-model" placeholder="gemini-2.5-flash">
    <button type="button" id="subtr-set-save">Зберегти</button>
    <div id="subtr-set-status"></div>
  `;

  document.body.appendChild(panel);

  fields = {
    apiKey: panel.querySelector('#subtr-set-apiKey')!,
    sourceLang: panel.querySelector('#subtr-set-sourceLang')!,
    targetLang: panel.querySelector('#subtr-set-targetLang')!,
    model: panel.querySelector('#subtr-set-model')!,
    save: panel.querySelector('#subtr-set-save')!,
    status: panel.querySelector('#subtr-set-status')!,
    acctStatus: panel.querySelector('#subtr-acct-status')!,
    acctBtn: panel.querySelector('#subtr-acct-btn')!
  };

  // Стартовий стан акаунта тягнемо з воркера (той читає токени зі storage).
  getAuthStatus().then(renderAuth);
  fields.acctBtn.addEventListener('click', onAuthButtonClick);

  loadFieldsFromStorage();

  fields.save.addEventListener('click', async () => {
    const apiKey = fields!.apiKey.value.trim();
    if (!apiKey) {
      fields!.status.textContent = MESSAGES.settingsApiKeyRequired;
      fields!.status.className = 'err';
      return;
    }

    const settings = {
      apiKey,
      sourceLang: fields!.sourceLang.value,
      targetLang: fields!.targetLang.value,
      model: fields!.model.value.trim() || DEFAULT_MODEL
    };

    // Локально завжди (background читає саме storage при кожному перекладі).
    await chrome.storage.local.set(settings);

    // Залогінений — дублюємо на акаунт, інакше панель і popup розійшлися б:
    // popup зберігає на бекенд, і при наступному логіні звідти прийшло б старе значення.
    const status = await getAuthStatus();
    if (!isAuthError(status) && status.loggedIn) {
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
    if (data.sourceLang) fields.sourceLang.value = data.sourceLang;
    if (data.targetLang) fields.targetLang.value = data.targetLang;
    fields.model.value = data.model || DEFAULT_MODEL; // M-6: значення, а не лише placeholder
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
