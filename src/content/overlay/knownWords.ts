// Список уже збережених слів для підсвічування прямо в субтитрах.
//
// Тримається в пам'яті content-script як множина лем у нижньому регістрі:
// renderCueText викликається на КОЖНУ репліку й перевіряє кожне слово, тож
// звірка має бути O(1) — запит до воркера на кожне слово був би неприйнятним.
//
// Оновлюється за wordsRevision (той самий лічильник, що й для popup), тому
// щойно збережене слово підсвічується вже в наступній репліці — без
// перезавантаження сторінки.

import { MSG, STORAGE } from '../../shared/messages';

let knownLemmas = new Set<string>();

export function isKnownWord(word: string): boolean {
  return knownLemmas.has(normalize(word));
}

// Слова в субтитрах приходять із пунктуацією і в різному регістрі, а леми з
// бекенду — у базовій формі. Зводимо обидві сторони до спільного вигляду.
function normalize(word: string): string {
  return word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

async function refresh(): Promise<void> {
  try {
    const resp = await chrome.runtime.sendMessage({ type: MSG.wordsList });
    if (!resp || resp.error || !Array.isArray(resp.words)) return;

    knownLemmas = new Set(
      resp.words
        .map((w: { lemma?: string; text?: string }) => normalize(w.lemma || w.text || ''))
        .filter(Boolean)
    );
  } catch {
    // не залогінений або бекенд недоступний — підсвічування просто не працює
  }
}

export function initKnownWords(): void {
  refresh();

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    // Нове збережене слово (або логін/логаут) — перечитуємо список.
    if (STORAGE.wordsRevision in changes || STORAGE.tokens in changes) refresh();
  });
}
