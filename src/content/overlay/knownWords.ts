// Словник користувача в пам'яті content-script — для підсвічування слів
// у субтитрах і для підрахунку складності відео.
//
// Тримається як Map<лема, srsLevel>, а не просто множина: підсвітка градуйована
// за рівнем засвоєння (щойно збережене привертає увагу, вивчене — ні).
// renderCueText викликається на КОЖНУ репліку й перевіряє кожне слово, тож
// звірка має лишатись O(1) — запит до воркера на кожне слово був би неприйнятним.
//
// Оновлюється за wordsRevision (той самий лічильник, що й для popup), тому
// щойно збережене слово підсвічується вже в наступній репліці — без
// перезавантаження сторінки. Оцінка на повторенні теж інкрементує лічильник,
// тож градація змінюється так само живо.

import { MSG, STORAGE, knownLevelOf } from '../../shared/messages';

let knownWords = new Map<string, number>();

// Слухачі, яким треба перерахуватись після оновлення словника (індикатор
// складності). Підписка, а не прямий виклик, щоб knownWords не знав про
// існування difficulty.ts — інакше вийшов би цикл імпортів.
type Listener = () => void;
const listeners: Listener[] = [];

export function onKnownWordsChanged(fn: Listener): void {
  listeners.push(fn);
}

export function isKnownWord(word: string): boolean {
  return knownWords.has(normalize(word));
}

// Клас підсвітки за рівнем засвоєння, або null якщо слова немає у словнику.
export function knownLevelFor(word: string): string | null {
  const level = knownWords.get(normalize(word));
  return level === undefined ? null : knownLevelOf(level);
}

export function knownWordsCount(): number {
  return knownWords.size;
}

// Слова в субтитрах приходять із пунктуацією і в різному регістрі, а леми з
// бекенду — у базовій формі. Зводимо обидві сторони до спільного вигляду.
export function normalize(word: string): string {
  return word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

async function refresh(): Promise<void> {
  try {
    const resp = await chrome.runtime.sendMessage({ type: MSG.wordsList });
    if (!resp || resp.error || !Array.isArray(resp.words)) return;

    const next = new Map<string, number>();
    for (const w of resp.words as Array<{ lemma?: string; text?: string; srsLevel?: number }>) {
      const key = normalize(w.lemma || w.text || '');
      if (!key) continue;
      // Слова, збережені до появи SRS, приходять без srsLevel — вважаємо їх
      // новими (0), а не засвоєними: інакше вони мовчки випали б із повторень.
      next.set(key, typeof w.srsLevel === 'number' ? w.srsLevel : 0);
    }
    knownWords = next;

    listeners.forEach((fn) => fn());
  } catch {
    // не залогінений або бекенд недоступний — підсвічування просто не працює
  }
}

export function initKnownWords(): void {
  refresh();

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    // Нове збережене слово, оцінка на повторенні, логін/логаут — перечитуємо.
    if (STORAGE.wordsRevision in changes || STORAGE.tokens in changes) refresh();
  });
}
