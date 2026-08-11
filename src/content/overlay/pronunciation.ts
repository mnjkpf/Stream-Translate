// Практика вимови: повтори репліку вголос — побачиш, які слова прозвучали,
// а які ні.
//
// Симетрична пара до озвучення (studyControls.speak): почув -> повторив ->
// побачив, де промазав. Використовує Web Speech API розпізнавання, тобто
// безкоштовно і без нашого бекенду.
//
// Чесне застереження: у Chrome розпізнавання НЕ офлайнове — аудіо йде на
// сервери Google. Це відрізняє його від синтезу мовлення, який працює локально.
// Плюс потрібен дозвіл на мікрофон для домену сторінки (youtube.com), який
// браузер запитує при першому запуску.

import { state } from '../state';
import { MESSAGES } from '../../shared/i18n';
import { showToast } from './ui';
// Сам алгоритм порівняння живе в shared/ — щоб бути покритим тестами
// (цей модуль тягне DOM і Web Speech API, у Node-харнес не вантажиться).
import { comparePronunciation, type PronunciationResult } from '../../shared/pronunciationMatch';

const PANEL_ID = 'subtr-pronounce';

// Ті самі коди, що й для синтезу — але тут вони критичніші: розпізнавання
// з неправильною мовою повертає не «погану оцінку», а суцільне сміття.
const RECOGNITION_LANGS: Record<string, string> = {
  English: 'en-US',
  Spanish: 'es-ES',
  French: 'fr-FR',
  German: 'de-DE',
  Polish: 'pl-PL',
  Italian: 'it-IT',
  Ukrainian: 'uk-UA'
};

let recognition: SpeechRecognition | null = null;
let listening = false;
let panel: HTMLElement | null = null;

function recognitionCtor(): { new (): SpeechRecognition } | undefined {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

export function isRecognitionSupported(): boolean {
  return Boolean(recognitionCtor());
}

function ensurePanel(): HTMLElement {
  if (panel && panel.isConnected) return panel;

  panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.setAttribute('role', 'status');
  panel.addEventListener('click', hidePanel);
  document.body.appendChild(panel);
  return panel;
}

function hidePanel(): void {
  panel?.classList.remove('visible');
}

function renderListening(): void {
  const el = ensurePanel();
  el.className = 'visible';
  el.textContent = '';

  const title = document.createElement('div');
  title.className = 'subtr-pron-title';
  title.textContent = MESSAGES.pronounceListening;
  el.appendChild(title);
}

// textContent для кожного слова окремо — текст приходить від розпізнавача
// й із субтитрів, вставляти його розміткою не можна.
function renderResult(result: PronunciationResult): void {
  const el = ensurePanel();
  el.className = 'visible';
  el.textContent = '';

  const title = document.createElement('div');
  title.className = 'subtr-pron-title';
  title.textContent = MESSAGES.pronounceScore(result.score);
  el.appendChild(title);

  const line = document.createElement('div');
  line.className = 'subtr-pron-line';
  result.expected.forEach((word, i) => {
    const span = document.createElement('span');
    span.className = result.matched[i] ? 'subtr-pron-hit' : 'subtr-pron-miss';
    span.textContent = word;
    line.appendChild(span);
    if (i < result.expected.length - 1) line.appendChild(document.createTextNode(' '));
  });
  el.appendChild(line);

  const hint = document.createElement('div');
  hint.className = 'subtr-pron-hint';
  hint.textContent = MESSAGES.pronounceHint;
  el.appendChild(hint);
}

function errorMessage(code: string): string {
  if (code === 'not-allowed' || code === 'service-not-allowed') return MESSAGES.pronounceNoMic;
  if (code === 'no-speech') return MESSAGES.pronounceNoSpeech;
  if (code === 'network') return MESSAGES.pronounceNetwork;
  return MESSAGES.pronounceFailed;
}

export async function startPronunciationPractice(): Promise<void> {
  const Ctor = recognitionCtor();
  if (!Ctor) {
    showToast(MESSAGES.pronounceUnsupported);
    return;
  }

  // Друге натискання під час запису — зупинити, а не почати ще один сеанс
  // (паралельні розпізнавачі конфліктують за мікрофон).
  if (listening) {
    recognition?.stop();
    return;
  }

  const cue = state.currentCue;
  if (!cue) {
    showToast(MESSAGES.pronounceNoCue);
    return;
  }

  // Репліка може містити переноси — для порівняння це один рядок.
  const expectedText = cue.text.replace(/\n/g, ' ');

  const settings = await chrome.storage.local.get('sourceLang');
  const lang = RECOGNITION_LANGS[settings.sourceLang || 'English'] ?? 'en-US';

  // Ставимо відео на паузу: інакше мікрофон записував би сам фільм і
  // розпізнавач порівнював би репліку саму з собою.
  const wasPlaying = state.video && !state.video.paused;
  if (wasPlaying) state.video!.pause();

  recognition = new Ctor();
  recognition.lang = lang;
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  listening = true;
  renderListening();

  recognition.onresult = (event) => {
    const heard = event.results[0]?.[0]?.transcript ?? '';
    renderResult(comparePronunciation(expectedText, heard));
  };

  recognition.onerror = (event) => {
    hidePanel();
    showToast(errorMessage(event.error));
  };

  recognition.onend = () => {
    listening = false;
    recognition = null;
    // Відновлюємо відтворення тільки якщо самі його зупинили.
    if (wasPlaying && state.video?.paused) state.video.play().catch(() => {});
  };

  try {
    recognition.start();
  } catch {
    // start() кидає, якщо попередній сеанс ще не завершився
    listening = false;
    recognition = null;
    hidePanel();
    showToast(MESSAGES.pronounceFailed);
  }
}
