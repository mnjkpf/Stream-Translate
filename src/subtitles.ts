// Subtitle Translator — пошук відео, завантаження і прив'язка субтитрів
// Ручне завантаження SRT/VTT (readFileSmart) і авто-завантаження з адаптера
// (loadCuesFromSource, C: YouTube тощо) — обидва шляхи ведуть до attachToVideo.

import { adapter } from './activeAdapter';
import { state } from './state';
import { MESSAGES } from './i18n';
import { showToast } from './ui';
import { renderCueText, onTimeUpdate } from './sync';
import type { SubtitleSource, SubtitleFetchResult } from './siteAdapter';

// ═══════════════════════════════════════════════════════════
// ПОШУК <video> (делегується активному адаптеру сайту)
// ═══════════════════════════════════════════════════════════
const WAIT_FOR_VIDEO_TIMEOUT_MS = 30000; // L-11: не чекати вічно на сторінці без плеєра

export function waitForVideo(): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = adapter.findVideo();
    if (v) return resolve(v);

    const obs = new MutationObserver(() => {
      const v = adapter.findVideo();
      if (v) {
        cleanup();
        resolve(v);
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(MESSAGES.videoNotFound));
    }, WAIT_FOR_VIDEO_TIMEOUT_MS);

    function cleanup() {
      obs.disconnect();
      clearTimeout(timer);
    }
  });
}

// ═══════════════════════════════════════════════════════════
// ЗАВАНТАЖЕННЯ ФАЙЛУ (підтримка UTF-8 і Windows-1251)
// ═══════════════════════════════════════════════════════════
const MAX_SUBTITLE_FILE_SIZE = 5 * 1024 * 1024; // L-13: захист від випадково обраного величезного файлу

export function readFileSmart(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_SUBTITLE_FILE_SIZE) {
      reject(new Error(MESSAGES.fileTooLarge((file.size / 1024 / 1024).toFixed(1))));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const buffer = reader.result as ArrayBuffer;
      // Спроба UTF-8
      let text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
      // Якщо багато заміняючих символів — пробуємо CP1251
      const replacementCount = (text.match(/�/g) || []).length;
      if (replacementCount > text.length * 0.01) {
        text = new TextDecoder('windows-1251').decode(buffer);
      }
      resolve(text);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

// ═══════════════════════════════════════════════════════════
// ПРИВ'ЯЗКА ДО ВІДЕО
// ═══════════════════════════════════════════════════════════
export function attachToVideo(): void {
  if (!state.video || !state.container) return;

  // Знаходимо контейнер плеєра (через адаптер сайту) і кладемо туди субтитри
  const playerContainer = adapter.getMountPoint(state.video);
  if (playerContainer && !playerContainer.contains(state.container)) {
    // Гарантуємо що батько має position
    const cs = getComputedStyle(playerContainer);
    if (cs.position === 'static') {
      (playerContainer as HTMLElement).style.position = 'relative';
    }
    playerContainer.appendChild(state.container);
  }
  state.container.style.display = 'block';
}

// Рівень 3 (§1.2.C): зупинка DOM-скрейпінгу з попереднього відео/спроби —
// інакше MutationObserver з минулого ролика продовжував би писати в
// overlay поверх нового стану.
let domFallbackStop: (() => void) | null = null;
function stopDomFallback(): void {
  if (domFallbackStop) {
    domFallbackStop();
    domFallbackStop = null;
  }
}

// H-2: при переприв'язці до нового <video> (нова серія, перерендер плеєра)
// старі cues/offset/currentCue і напис на кнопці не мають лишатись —
// інакше субтитри попередньої серії накладаються на нову.
export function resetSubtitleState(): void {
  stopDomFallback();
  state.cues = [];
  state.currentCue = null;
  state.offset = 0;
  if (state.container) state.container.innerHTML = '';
  if (state.loadBtn) {
    state.loadBtn.classList.remove('has-subs');
    state.loadBtn.textContent = MESSAGES.loadButtonIdle;
  }
}

export function handleVideoChanged(newVideo: HTMLVideoElement): void {
  if (state.video) {
    state.video.removeEventListener('timeupdate', onTimeUpdate);
  }
  state.video = newVideo;
  state.video.addEventListener('timeupdate', onTimeUpdate);
  resetSubtitleState();
  attachToVideo();

  // Якщо адаптер сам постачає субтитри (YouTube) — це не лише зміна
  // ролика (та йде через observeNavigation), а й будь-яка заміна <video>
  // (напр. вставка рекламного відео) — теж має підтягнути cues заново
  const subtitleSource = adapter.getSubtitleSource();
  if (subtitleSource) loadCuesFromSource(subtitleSource);
}

// ═══════════════════════════════════════════════════════════
// АВТОЗАВАНТАЖЕННЯ СУБТИТРІВ З АДАПТЕРА (getSubtitleSource(), C, YouTube)
// Якщо адаптер сайту не постачає субтитри сам (getSubtitleSource() === null) —
// цей блок узагалі не викликається, лишається кнопка + ручне завантаження SRT.
// ═══════════════════════════════════════════════════════════
let subtitleLoadRequestId = 0; // та сама ідея, що й L-5 для перекладу

export async function loadCuesFromSource(source: SubtitleSource): Promise<void> {
  const requestId = ++subtitleLoadRequestId;
  stopDomFallback();

  let result!: SubtitleFetchResult;
  try {
    result = await source.fetchCues();
  } catch (err) {
    console.error('[Subtitle Translator] fetchCues error:', err);
    // Застаріла відповідь (користувач уже перемкнув відео) — не показуємо
    // помилку/не чіпаємо cues нового відео
    if (requestId !== subtitleLoadRequestId) return;
    adapter.showNativeSubtitles?.();
    showToast(MESSAGES.subtitlesLoadError);
    return;
  }

  if (requestId !== subtitleLoadRequestId) return; // гонка: прийшла застаріла відповідь

  const cues = result?.cues || [];
  state.cues = cues;
  state.currentCue = null;
  if (state.container) state.container.innerHTML = '';

  if (cues.length === 0) {
    // Рівень 3 (§1.2.C, опційний хук адаптера): перш ніж здатись
    // остаточно, пробуємо DOM-скрейпінг живих нативних субтитрів.
    const started = adapter.startCaptionFallback?.((text) => {
      if (requestId !== subtitleLoadRequestId) return;
      renderCueText(text);
    });

    if (started) {
      domFallbackStop = started;
      attachToVideo();
      adapter.hideNativeSubtitles?.();
      return;
    }

    adapter.showNativeSubtitles?.();
    // noCaptions: треків справді немає. loadFailed: треки є, але timedtext
    // не віддав валідного тіла (§1.2.B) — розрізнення для чесного повідомлення.
    const message = result?.state === 'loadFailed'
      ? MESSAGES.subtitlesLoadError
      : MESSAGES.subtitlesUnavailable;
    showToast(message);
    return;
  }

  attachToVideo();
  adapter.hideNativeSubtitles?.();

  if (result.isFallbackLanguage && result.languageCode) {
    showToast(MESSAGES.subtitleFallbackLanguage(result.languageCode));
  }
}
