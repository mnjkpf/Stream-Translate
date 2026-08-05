// Subtitle Translator — DOM-елементи overlay (кнопка, індикатор, toast)
// і fullscreen-релокейт (C-1).

import { adapter } from '../adapters/activeAdapter';
import { state } from '../state';
import { MESSAGES } from '../../shared/i18n';
import { parseSubtitles } from '../subtitles/subtitleParser';
import { readFileSmart, attachToVideo } from '../subtitles/subtitles';
import { getSettingsPanelEl } from './settingsPanel';

// ═══════════════════════════════════════════════════════════
// СТВОРЕННЯ UI
// ═══════════════════════════════════════════════════════════
export function createUI(): void {
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

  state.loadBtn.addEventListener('click', () => state.fileInput!.click());

  state.fileInput.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const text = await readFileSmart(file);
      state.cues = parseSubtitles(text);
      if (state.cues.length === 0) {
        showToast(MESSAGES.parseError);
        return;
      }
      state.loadBtn!.classList.add('has-subs');
      state.loadBtn!.textContent = MESSAGES.loadButtonLoaded(state.cues.length);
      attachToVideo();
    } catch (err) {
      showToast(MESSAGES.fileReadError((err as Error).message));
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
    if ((e.target as HTMLElement).matches('input, textarea')) return;
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
}

let offsetHideTimer: ReturnType<typeof setTimeout> | undefined;

function showOffset(): void {
  const indicator = state.offsetIndicator!;
  indicator.textContent = MESSAGES.offsetIndicator(state.offset);
  indicator.classList.add('visible');
  clearTimeout(offsetHideTimer);
  offsetHideTimer = setTimeout(() => {
    indicator.classList.remove('visible');
  }, 2000);
}

let toastHideTimer: ReturnType<typeof setTimeout> | undefined;

// L-8: заміна alert() — не блокує сторінку, консистентна з рештою UI
export function showToast(message: string): void {
  const toast = state.toast!;
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastHideTimer);
  toastHideTimer = setTimeout(() => {
    toast.classList.remove('visible');
  }, 4000);
}

// ═══════════════════════════════════════════════════════════
// FULLSCREEN (C-1) — tooltip/кнопка SRT/індикатор зсуву висять на
// document.body, який НЕ рендериться в top-layer справжнього Fullscreen
// API. На fullscreenchange переносимо їх у корінь, який справді йде
// у fullscreen (адаптер сайту підказує, що це за елемент).
// ═══════════════════════════════════════════════════════════
function getFloatingElements(): HTMLElement[] {
  // Панель налаштувань (settingsPanel.ts) створюється лениво при першому
  // відкритті — getSettingsPanelEl() лишається null до того.
  const settingsPanel = getSettingsPanelEl();
  return [state.tooltip, state.loadBtn, state.fileInput, state.offsetIndicator, state.toast, settingsPanel]
    .filter((el): el is HTMLElement => Boolean(el));
}

export function relocateFloatingUI(): void {
  if (!state.video) return;
  const target = adapter.getFullscreenRoot(state.video) || document.body;
  getFloatingElements().forEach(el => {
    if (el.parentElement !== target) target.appendChild(el);
  });
}
