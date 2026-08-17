// Єдине джерело правди для міжконтекстного обміну: імена повідомлень і ключі
// storage. Раніше вони були рядковими літералами в чотирьох файлах — розбіжність
// у одному символі мовчки ламала фічу, і це не ловилось ні типами, ні тестами.

// ── Повідомлення до service worker (chrome.runtime.sendMessage) ──────────────
export const MSG = {
  translate: 'translate',
  saveWord: 'saveWord',

  authLogin: 'auth:login',
  authLogout: 'auth:logout',
  authStatus: 'auth:status',

  meGet: 'me:get',
  settingsUpdate: 'settings:update',

  wordsList: 'words:list',
  wordsDelete: 'words:delete',

  quotaGet: 'quota:get',

  historyList: 'history:list',
  statsGet: 'stats:get',

  // Інтервальні повторення (SRS)
  reviewDue: 'review:due',
  reviewGrade: 'review:grade',
  reviewCount: 'review:count',

  // «Ти постійно це шукаєш» — часті пошуки, які так і не збережені
  frequentGet: 'frequent:get'
} as const;

// Рівні засвоєння для підсвічування в субтитрах. Межі — по srsLevel з бекенду.
// Сенс градації: слово, яке ти щойно зберіг, має привертати увагу, а вже
// вивчене — лише ненав'язливо підтверджувати «це ти знаєш». Однаковий колір
// для обох перетворював би підсвітку на шум, щойно словник трохи виросте.
export const KNOWN_LEVEL = {
  new: 'new',           // srsLevel 0-1 — щойно збережене, ще не закріплене
  learning: 'learning', // srsLevel 2-4 — у процесі
  mastered: 'mastered'  // srsLevel 5+ — засвоєне
} as const;

export function knownLevelOf(srsLevel: number): string {
  if (srsLevel >= 5) return KNOWN_LEVEL.mastered;
  if (srsLevel >= 2) return KNOWN_LEVEL.learning;
  return KNOWN_LEVEL.new;
}

// Звідки береться ключ Gemini. 'own' — ключ користувача зі storage (працює
// офлайн і без логіну); 'proxy' — серверний ключ через наш бекенд (потребує
// логіну і має денну квоту).
export const KEY_SOURCE = {
  own: 'own',
  proxy: 'proxy'
} as const;

// ── Ключі chrome.storage.local ───────────────────────────────────────────────
export const STORAGE = {
  // Налаштування (дзеркаляться з бекендом, коли користувач залогінений)
  apiKey: 'apiKey',
  sourceLang: 'sourceLang',
  targetLang: 'targetLang',
  model: 'model',
  keySource: 'keySource', // 'own' | 'proxy' — див. KEY_SOURCE нижче

  // Мова інтерфейсу: 'uk' | 'en' | 'pl' (див. shared/i18n.ts). Свідомо тут, а
  // не в chrome.i18n з теками _locales: той механізм читає мову браузера і не
  // дає її перевизначити, а тут мову обирає користувач.
  uiLang: 'uiLang',

  // Автентифікація
  tokens: 'authTokens',
  profile: 'authProfile',

  // Локальний словник (використовується, лише поки не залогінений)
  wordbook: 'wordbook',

  // Лічильник змін словника. Інкрементується воркером після кожного успішного
  // збереження/видалення слова. Слухачі storage.onChanged бачать зміну і
  // перечитують дані — так popup і панель оновлюються без перезавантаження.
  wordsRevision: 'wordsRevision'
} as const;

export const SETTINGS_KEYS = [
  STORAGE.apiKey,
  STORAGE.sourceLang,
  STORAGE.targetLang,
  STORAGE.model,
  STORAGE.keySource,
  STORAGE.uiLang
] as const;

// Чи зачепили зміни storage хоч один із перелічених ключів.
export function touched(
  changes: Record<string, chrome.storage.StorageChange>,
  keys: readonly string[]
): boolean {
  return keys.some((key) => key in changes);
}
