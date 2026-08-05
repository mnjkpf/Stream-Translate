// Subtitle Translator — оркестрація: init() і переприв'язка при
// перерендері плеєра (H-3). Єдина точка входу content-script бандла —
// esbuild (build.mjs) резолвить увесь граф import/export звідси.

import { adapter, isSiteSupported } from './adapters/activeAdapter';
import { state } from './state';
import {
  waitForVideo,
  attachToVideo,
  resetSubtitleState,
  handleVideoChanged,
  loadCuesFromSource
} from './subtitles/subtitles';
import { createUI, relocateFloatingUI } from './overlay/ui';
import { setupInteraction } from './overlay/interaction';
import { onTimeUpdate } from './subtitles/sync';
import { ensureSettingsButton } from './overlay/settingsPanel';

declare global {
  interface Window {
    __subtrBooted?: boolean;
  }
}

// ПЕРЕПРИВ'ЯЗКА ПРИ ПЕРЕРЕНДЕРІ ПЛЕЄРА (H-3)
// Спостерігаємо document.body, бо сайт може перебудувати плеєр де завгодно
// в дереві. Але без фільтра observer тригерить сам себе: наш власний
// renderCue()/showTooltip() переписують innerHTML контейнера й tooltip на
// кожен cue. Ігноруємо мутації всередині наших елементів і об'єднуємо
// решту через debounce, щоб не ганяти findVideo() на кожен дрібний DOM-чанк.
const OWN_ROOTS_SELECTOR = '#subtr-subs, #subtr-tooltip, #subtr-settings, #subtr-settings-btn';
const REATTACH_DEBOUNCE_MS = 250;

function isOwnMutation(mutations: MutationRecord[]): boolean {
  return mutations.every(m => m.target.nodeType === 1 && (m.target as Element).closest(OWN_ROOTS_SELECTOR));
}

function checkVideoReattach(): void {
  const currentVideo = adapter.findVideo();
  if (currentVideo && currentVideo !== state.video) {
    handleVideoChanged(currentVideo);
  } else if (state.cues.length > 0 && state.container && !state.container.isConnected) {
    attachToVideo();
  }
  // §2.3.C: YouTube перебудовує панель керування плеєра — та сама
  // debounce-перевірка, що й для <video>, ідемпотентно повертає кнопку.
  ensureSettingsButton();
}

async function init(): Promise<void> {
  state.video = await waitForVideo();
  createUI();
  setupInteraction();
  ensureSettingsButton();

  // Слідкуємо за timeupdate
  state.video.addEventListener('timeupdate', onTimeUpdate);

  // C-1: переносимо плаваючі елементи у fullscreen-корінь і назад
  document.addEventListener('fullscreenchange', relocateFloatingUI);
  relocateFloatingUI();

  // C: якщо адаптер сам постачає субтитри (YouTube) — вантажимо їх одразу
  // й перезавантажуємо на кожну зміну ролика (§5: SPA-навігація,
  // observeNavigation — платформо-специфічний хук, реалізований не для всіх сайтів)
  const subtitleSource = adapter.getSubtitleSource();
  if (subtitleSource) {
    loadCuesFromSource(subtitleSource);
    adapter.observeNavigation?.(() => {
      resetSubtitleState();
      loadCuesFromSource(subtitleSource);
      ensureSettingsButton();
    });
  }

  // Якщо плеєр перерендерюється (зміна серії) — переприв'язуємось (H-3: з debounce)
  let reattachTimer: ReturnType<typeof setTimeout> | undefined;
  const reattachObs = new MutationObserver((mutations) => {
    if (isOwnMutation(mutations)) return;
    clearTimeout(reattachTimer);
    reattachTimer = setTimeout(checkVideoReattach, REATTACH_DEBOUNCE_MS);
  });
  reattachObs.observe(document.body, { childList: true, subtree: true });
}

// Подвійна ін'єкція (SPA-переінжект тощо): попередній екземпляр і так
// живий (його DOM/слухачі нікуди не ділись), тому просто нічого не робимо.
// window.__subtrBooted — єдиний глобал, що лишився: module-scope змінна
// НЕ пережила б повторну ін'єкцію бандла (кожна ін'єкція — свіжий scope),
// а прапорець на window — переживає.
if (isSiteSupported && !window.__subtrBooted) {
  window.__subtrBooted = true;
  init().catch(err => console.error('[Subtitle Translator] Init error:', err));
}
