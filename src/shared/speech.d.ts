// Мінімальні типи Web Speech API (розпізнавання мовлення).
//
// Чому окремий файл, а не lib.dom: SpeechRecognition досі не увійшов до
// стандартної бібліотеки TypeScript, бо специфікація не фіналізована, а в
// Chrome він живе під префіксом webkit. Описуємо лише ту підмножину, якою
// реально користуємось — у дусі chrome.d.ts (жодних @types/*).

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResult {
  readonly length: number;
  readonly isFinal: boolean;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  // 'no-speech' | 'aborted' | 'audio-capture' | 'not-allowed' | 'network' | ...
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;

  start(): void;
  stop(): void;
  abort(): void;

  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((event: Event) => void) | null;
  onstart: ((event: Event) => void) | null;
}

declare const SpeechRecognition: { new (): SpeechRecognition } | undefined;
declare const webkitSpeechRecognition: { new (): SpeechRecognition } | undefined;

interface Window {
  SpeechRecognition?: { new (): SpeechRecognition };
  webkitSpeechRecognition?: { new (): SpeechRecognition };
}
