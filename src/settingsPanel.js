// Subtitle Translator — in-page панель налаштувань + кнопка в плеєрі
// (§2, CLAUDE_CODE_BRIEF_YT_FIXES.md). Платформо-незалежний модуль: кнопку й
// панель створює content-script, місце вставки кнопки в UI плеєра делегує
// адаптеру сайту через опційний хук adapter.placeSettingsButton() — якщо
// адаптер його не реалізує, кнопки в плеєрі немає, лишається popup.
//
// Панель — дзеркало полів popup.html: пише в ті самі ключі chrome.storage.local
// (apiKey, sourceLang, targetLang, model), тому налаштування, збережені тут
// чи в popup, завжди узгоджені між собою.

(() => {
  'use strict';

  const TR = window.__subtr;
  if (!TR || !TR.adapter) return; // сайт не підтримується — модуль мовчить

  const { adapter, MESSAGES } = TR;

  const SETTINGS_BUTTON_ID = 'subtr-settings-btn';
  const SETTINGS_PANEL_ID = 'subtr-settings';

  let panelEl = null;
  let fields = null;

  function buildPanel() {
    const panel = document.createElement('div');
    panel.id = SETTINGS_PANEL_ID;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', MESSAGES.settingsPanelAriaLabel);

    panel.innerHTML = `
      <div class="subtr-settings-head">Subtitle Translator</div>
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
      <input type="text" id="subtr-set-model" placeholder="gemini-2.0-flash">
      <button type="button" id="subtr-set-save">Зберегти</button>
      <div id="subtr-set-status"></div>
    `;

    document.body.appendChild(panel);

    fields = {
      apiKey: panel.querySelector('#subtr-set-apiKey'),
      sourceLang: panel.querySelector('#subtr-set-sourceLang'),
      targetLang: panel.querySelector('#subtr-set-targetLang'),
      model: panel.querySelector('#subtr-set-model'),
      save: panel.querySelector('#subtr-set-save'),
      status: panel.querySelector('#subtr-set-status')
    };

    chrome.storage.local.get(['apiKey', 'sourceLang', 'targetLang', 'model'], (data) => {
      if (data.apiKey) fields.apiKey.value = data.apiKey;
      if (data.sourceLang) fields.sourceLang.value = data.sourceLang;
      if (data.targetLang) fields.targetLang.value = data.targetLang;
      if (data.model) fields.model.value = data.model;
    });

    fields.save.addEventListener('click', async () => {
      const apiKey = fields.apiKey.value.trim();
      if (!apiKey) {
        fields.status.textContent = MESSAGES.settingsApiKeyRequired;
        fields.status.className = 'err';
        return;
      }

      await chrome.storage.local.set({
        apiKey,
        sourceLang: fields.sourceLang.value,
        targetLang: fields.targetLang.value,
        model: fields.model.value.trim()
      });

      fields.status.textContent = MESSAGES.settingsSaved;
      fields.status.className = 'ok';
      setTimeout(() => { fields.status.textContent = ''; }, 2000);
    });

    // Закриття: клік поза панеллю (і не по кнопці, яка й так тогглить панель)
    document.addEventListener('mousedown', (e) => {
      if (!panel.classList.contains('visible')) return;
      if (panel.contains(e.target)) return;
      if (e.target.closest('#' + SETTINGS_BUTTON_ID)) return;
      TR.closeSettingsPanel();
    });

    // Закриття: Esc
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panel.classList.contains('visible')) {
        TR.closeSettingsPanel();
      }
    });

    return panel;
  }

  TR.toggleSettingsPanel = function toggleSettingsPanel() {
    if (!panelEl) panelEl = buildPanel();

    if (panelEl.classList.contains('visible')) {
      TR.closeSettingsPanel();
    } else {
      // Той самий механізм, що переносить tooltip/кнопку SRT у fullscreen-
      // корінь (C-1, ui.js) — панель додана в getFloatingElements() нижче.
      TR.relocateFloatingUI?.();
      panelEl.classList.add('visible');
    }
  };

  TR.closeSettingsPanel = function closeSettingsPanel() {
    if (panelEl) panelEl.classList.remove('visible');
  };

  // ui.js: relocateFloatingUI() переносить і панель налаштувань разом з
  // tooltip/кнопкою SRT при вході/виході з fullscreen (панель створюється
  // лише лениво, при першому відкритті, тому лишається null до того).
  TR.getSettingsPanelEl = function getSettingsPanelEl() {
    return panelEl;
  };

  // ═══════════════════════════════════════════════════════════
  // Кнопка в панелі плеєра (§2.3.B)
  // ═══════════════════════════════════════════════════════════
  function createSettingsButton() {
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
      TR.toggleSettingsPanel();
    });
    return btn;
  }

  // §2.3.C: YouTube перебудовує панель керування — перевіряємо наявність і
  // за потреби переінжектимо ідемпотентно (без дублікатів за id).
  TR.ensureSettingsButton = function ensureSettingsButton() {
    if (!adapter.placeSettingsButton) return; // хук не реалізовано адаптером — кнопки в плеєрі нема
    if (document.getElementById(SETTINGS_BUTTON_ID)) return; // вже вставлена

    // Кнопка в плеєрі — НЕкритична фіча. Її збій не має валити init() у main.js
    // (раніше NotFoundError з insertBefore зупиняв усю ініціалізацію: без
    // субтитрів, слухачів і навігації). Тому будь-яка помилка тут — лише лог.
    try {
      adapter.placeSettingsButton(createSettingsButton());
    } catch (err) {
      console.warn('[Subtitle Translator] settings button placement failed:', err);
    }
  };
})();
