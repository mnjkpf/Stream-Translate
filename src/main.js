// HDRezka Subtitle Translator — оркестрація: init() і переприв'язка при
// перерендері плеєра (H-3). Останній файл у ланцюжку — усі означення з
// інших модулів мають бути на місці до виклику init().

(() => {
  'use strict';

  const TR = window.__hdrezkaTr;
  if (!TR || !TR.adapter) return; // сайт не підтримується — модуль мовчить
  if (TR.booted) return; // подвійна ін'єкція: init() вже викликався раніше

  const { adapter, state } = TR;

  // ═══════════════════════════════════════════════════════════
  // ПЕРЕПРИВ'ЯЗКА ПРИ ПЕРЕРЕНДЕРІ ПЛЕЄРА (H-3)
  // Спостерігаємо document.body, бо HDRezka може перебудувати плеєр де
  // завгодно в дереві. Але без фільтра observer тригерить сам себе: наш
  // власний renderCue()/showTooltip() переписують innerHTML контейнера й
  // tooltip на кожен cue. Ігноруємо мутації всередині наших елементів і
  // об'єднуємо решту через debounce, щоб не ганяти findVideo() на кожен
  // дрібний DOM-чанк.
  // ═══════════════════════════════════════════════════════════
  const OWN_ROOTS_SELECTOR = '#hdrezka-tr-subs, #hdrezka-tr-tooltip, #hdrezka-tr-settings, #hdrezka-tr-settings-btn';
  const REATTACH_DEBOUNCE_MS = 250;

  function isOwnMutation(mutations) {
    return mutations.every(m => m.target.nodeType === 1 && m.target.closest(OWN_ROOTS_SELECTOR));
  }

  function checkVideoReattach() {
    const currentVideo = adapter.findVideo();
    if (currentVideo && currentVideo !== state.video) {
      TR.handleVideoChanged(currentVideo);
    } else if (state.cues.length > 0 && state.container && !state.container.isConnected) {
      TR.attachToVideo();
    }
    // §2.3.C: YouTube перебудовує панель керування плеєра — та сама
    // debounce-перевірка, що й для <video>, ідемпотентно повертає кнопку.
    TR.ensureSettingsButton?.();
  }

  // ═══════════════════════════════════════════════════════════
  // ІНІЦІАЛІЗАЦІЯ
  // ═══════════════════════════════════════════════════════════
  async function init() {
    state.video = await TR.waitForVideo();
    TR.createUI();
    TR.setupInteraction();
    TR.ensureSettingsButton?.();

    // Слідкуємо за timeupdate
    state.video.addEventListener('timeupdate', TR.onTimeUpdate);

    // C-1: переносимо плаваючі елементи у fullscreen-корінь і назад
    document.addEventListener('fullscreenchange', TR.relocateFloatingUI);
    TR.relocateFloatingUI();

    // C: якщо адаптер сам постачає субтитри (YouTube) — вантажимо їх одразу
    // й перезавантажуємо на кожну зміну ролика (§5: SPA-навігація,
    // observeNavigation — платформо-специфічний хук, для HDRezka не реалізований)
    const subtitleSource = adapter.getSubtitleSource();
    if (subtitleSource) {
      TR.loadCuesFromSource(subtitleSource);
      adapter.observeNavigation?.(() => {
        TR.resetSubtitleState();
        TR.loadCuesFromSource(subtitleSource);
        TR.ensureSettingsButton?.();
      });
    }

    // Якщо плеєр перерендерюється (зміна серії) — переприв'язуємось (H-3: з debounce)
    let reattachTimer = null;
    const reattachObs = new MutationObserver((mutations) => {
      if (isOwnMutation(mutations)) return;
      clearTimeout(reattachTimer);
      reattachTimer = setTimeout(checkVideoReattach, REATTACH_DEBOUNCE_MS);
    });
    reattachObs.observe(document.body, { childList: true, subtree: true });
  }

  TR.booted = true;
  init().catch(err => console.error('[HDRezka Translator] Init error:', err));
})();
