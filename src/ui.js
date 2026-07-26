// Subtitle Translator — DOM-елементи overlay (кнопка, індикатор, toast)
// і fullscreen-релокейт (C-1).

(() => {
  'use strict';

  const TR = window.__subtr;
  if (!TR || !TR.adapter) return; // сайт не підтримується — модуль мовчить

  const { adapter, state, MESSAGES } = TR;
  const { parseSubtitles } = self.SubtitleParser;

  // ═══════════════════════════════════════════════════════════
  // СТВОРЕННЯ UI
  // ═══════════════════════════════════════════════════════════
  TR.createUI = function createUI() {
    // Контейнер субтитрів — кладемо в батька <video>
    state.container = document.createElement('div');
    state.container.id = 'subtr-subs';
    state.container.style.display = 'none';

    // Tooltip для перекладу
    state.tooltip = document.createElement('div');
    state.tooltip.id = 'subtr-tooltip';
    // L-7: доступність — оголошуємо як діалог з переклад, зміст читається вголос
    state.tooltip.setAttribute('role', 'dialog');
    state.tooltip.setAttribute('aria-live', 'polite');
    state.tooltip.setAttribute('aria-label', MESSAGES.tooltipAriaLabel);
    document.body.appendChild(state.tooltip);

    // Кнопка завантаження SRT
    state.loadBtn = document.createElement('button');
    state.loadBtn.id = 'subtr-load-btn';
    state.loadBtn.textContent = MESSAGES.loadButtonIdle;
    document.body.appendChild(state.loadBtn);

    // Прихований file input (M-8: .txt прибрано — парсер не має гілки для
    // довільного тексту, приймати його було оманливо)
    state.fileInput = document.createElement('input');
    state.fileInput.type = 'file';
    state.fileInput.accept = '.srt,.vtt';
    state.fileInput.style.display = 'none';
    document.body.appendChild(state.fileInput);

    // YouTube тощо: адаптер сам постачає субтитри (getSubtitleSource()) —
    // ручне завантаження SRT там не потрібне, кнопку ховаємо, а не видаляємо
    if (adapter.getSubtitleSource()) {
      state.loadBtn.style.display = 'none';
    }

    state.loadBtn.addEventListener('click', () => state.fileInput.click());

    state.fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await TR.readFileSmart(file);
        state.cues = parseSubtitles(text);
        if (state.cues.length === 0) {
          TR.showToast(MESSAGES.parseError);
          return;
        }
        state.loadBtn.classList.add('has-subs');
        state.loadBtn.textContent = MESSAGES.loadButtonLoaded(state.cues.length);
        TR.attachToVideo();
      } catch (err) {
        TR.showToast(MESSAGES.fileReadError(err.message));
      }
    });

    // Індикатор зсуву
    state.offsetIndicator = document.createElement('div');
    state.offsetIndicator.id = 'subtr-offset';
    document.body.appendChild(state.offsetIndicator);

    // L-8: toast для помилок замість блокуючого alert()
    state.toast = document.createElement('div');
    state.toast.id = 'subtr-toast';
    state.toast.setAttribute('role', 'alert');
    document.body.appendChild(state.toast);

    // Гарячі клавіші для зсуву: [ і ]
    document.addEventListener('keydown', (e) => {
      // Не реагуємо коли фокус в input/textarea
      if (e.target.matches('input, textarea')) return;
      if (state.cues.length === 0) return;

      // L-6: preventDefault — інакше ці клавіші можуть дублюватись
      // гарячими клавішами самого відеоплеєра
      if (e.key === '[') {
        e.preventDefault();
        state.offset -= 0.5;
        showOffset();
      } else if (e.key === ']') {
        e.preventDefault();
        state.offset += 0.5;
        showOffset();
      } else if (e.key === '\\') {
        e.preventDefault();
        state.offset = 0;
        showOffset();
      }
    });
  };

  function showOffset() {
    state.offsetIndicator.textContent = MESSAGES.offsetIndicator(state.offset);
    state.offsetIndicator.classList.add('visible');
    clearTimeout(state.offsetIndicator._t);
    state.offsetIndicator._t = setTimeout(() => {
      state.offsetIndicator.classList.remove('visible');
    }, 2000);
  }

  // L-8: заміна alert() — не блокує сторінку, консистентна з рештою UI
  TR.showToast = function showToast(message) {
    state.toast.textContent = message;
    state.toast.classList.add('visible');
    clearTimeout(state.toast._t);
    state.toast._t = setTimeout(() => {
      state.toast.classList.remove('visible');
    }, 4000);
  };

  // ═══════════════════════════════════════════════════════════
  // FULLSCREEN (C-1) — tooltip/кнопка SRT/індикатор зсуву висять на
  // document.body, який НЕ рендериться в top-layer справжнього Fullscreen
  // API. На fullscreenchange переносимо їх у корінь, який справді йде
  // у fullscreen (адаптер сайту підказує, що це за елемент).
  // ═══════════════════════════════════════════════════════════
  function getFloatingElements() {
    // Панель налаштувань (settingsPanel.js) створюється лениво при першому
    // відкритті — TR.getSettingsPanelEl лишається undefined до того.
    const settingsPanel = TR.getSettingsPanelEl?.();
    return [state.tooltip, state.loadBtn, state.fileInput, state.offsetIndicator, state.toast, settingsPanel]
      .filter(Boolean);
  }

  TR.relocateFloatingUI = function relocateFloatingUI() {
    if (!state.video) return;
    const target = adapter.getFullscreenRoot(state.video) || document.body;
    getFloatingElements().forEach(el => {
      if (el.parentElement !== target) target.appendChild(el);
    });
  };
})();
