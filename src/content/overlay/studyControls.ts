// Керування для навчання: повтор репліки, автопауза, вимова.
//
// Саме ці дрібниці перетворюють пасивний перегляд на заняття: почути рядок
// ще раз і встигнути розібрати його, поки відео не поїхало далі.

import { state } from '../state';
import { MESSAGES } from '../../shared/i18n';
import { showToast } from './ui';

// Автопауза вимикається за замовчуванням: постійні зупинки дратують, якщо
// людина просто дивиться. Вмикається клавішею і живе лише в межах сторінки.
let autoPauseEnabled = false;
let lastPausedCue: unknown = null;

// Мова субтитрів у назвах ('English') -> BCP-47 для синтезу мовлення.
// Без коректного коду браузер прочитав би англійське слово українським голосом.
const SPEECH_LANGS: Record<string, string> = {
  English: 'en-US',
  Spanish: 'es-ES',
  French: 'fr-FR',
  German: 'de-DE',
  Polish: 'pl-PL',
  Italian: 'it-IT',
  Ukrainian: 'uk-UA'
};

// Web Speech API вбудований у браузер: безкоштовно, офлайн, без квоти —
// на відміну від будь-якого TTS через мережу.
export function speak(text: string, languageName: string): void {
  const synth = window.speechSynthesis;
  if (!synth) return;

  synth.cancel(); // інакше кілька натискань поспіль стають у чергу
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = SPEECH_LANGS[languageName] ?? 'en-US';
  utterance.rate = 0.9; // трохи повільніше — це навчальний сценарій
  synth.speak(utterance);
}

export function isSpeechSupported(): boolean {
  return typeof window.speechSynthesis !== 'undefined';
}

// Перемотує на початок поточної репліки — «переслухати ще раз».
function replayCurrentCue(): void {
  const cue = state.currentCue;
  if (!cue || !state.video) return;

  state.video.currentTime = cue.start + state.offset;
  if (state.video.paused) state.video.play().catch(() => {});
  showToast(MESSAGES.replayedLine);
}

function toggleAutoPause(): void {
  autoPauseEnabled = !autoPauseEnabled;
  lastPausedCue = null;
  showToast(autoPauseEnabled ? MESSAGES.autoPauseOn : MESSAGES.autoPauseOff);
}

// Викликається з sync.ts на кожну зміну репліки.
export function onCueChangedForAutoPause(cue: unknown): void {
  if (!autoPauseEnabled || !cue || !state.video) return;
  // Пауза лише раз на репліку: без цієї перевірки відео не змогло б
  // зрушити з місця після відновлення відтворення.
  if (cue === lastPausedCue) return;

  lastPausedCue = cue;
  state.video.pause();
}

// Не перехоплюємо клавіші, коли людина щось друкує (пошук YouTube, наша панель),
// інакше 'r' у полі вводу перемотувало б відео.
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function setupStudyControls(): void {
  document.addEventListener('keydown', (e) => {
    if (isTypingTarget(e.target)) return;
    // Комбінації з модифікаторами лишаємо системі й сайту.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (state.cues.length === 0) return;

    const key = e.key.toLowerCase();

    // 'r' — replay: повторити поточну репліку.
    if (key === 'r') {
      e.preventDefault();
      e.stopPropagation();
      replayCurrentCue();
      return;
    }

    // 'a' — auto-pause: пауза на кожній новій репліці.
    if (key === 'a') {
      e.preventDefault();
      e.stopPropagation();
      toggleAutoPause();
    }
  }, true); // capture: YouTube вішає свої обробники й інакше з'їв би подію
}
