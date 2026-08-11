// Порівняння сказаного з очікуваною реплікою — чиста функція, без DOM.
//
// Винесено з pronunciation.ts саме заради тестів: той модуль тягне state,
// ui і Web Speech API, і в Node-харнес (tests/run.js) не завантажується.
// Тут же — самий алгоритм, який і має бути покритий.

export interface PronunciationResult {
  expected: string[];
  matched: boolean[];
  score: number;
}

// Людина вимовляє слова, а не розділові знаки, і розпізнавач розставляє
// пунктуацію та регістр як сам вважає за потрібне — зводимо обидві сторони
// до спільного вигляду, інакше "Hello," і "hello" рахувались би різними.
export function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
}

export function words(text: string): string[] {
  return text.split(/\s+/).map(normalizeWord).filter(Boolean);
}

// Порівнюємо мультимножинами, а не позиція-в-позицію: розпізнавач легко
// вставляє або губить артикль, і позиційне зіставлення після цього оголосило
// б увесь хвіст репліки помилковим через один зсув. Лічильник входжень (а не
// проста множина) потрібен, щоб повторене слово не «зараховувало» себе двічі:
// сказавши "the" один раз, не можна закрити обидва "the" в репліці.
export function comparePronunciation(expectedText: string, heardText: string): PronunciationResult {
  const expected = words(expectedText);
  const heard = words(heardText);

  const pool = new Map<string, number>();
  for (const word of heard) pool.set(word, (pool.get(word) ?? 0) + 1);

  const matched = expected.map((word) => {
    const left = pool.get(word) ?? 0;
    if (left === 0) return false;
    pool.set(word, left - 1);
    return true;
  });

  const hits = matched.filter(Boolean).length;
  return {
    expected,
    matched,
    score: expected.length === 0 ? 0 : Math.round((hits / expected.length) * 100)
  };
}
