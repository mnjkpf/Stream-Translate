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
  wordsDelete: 'words:delete'
} as const;

// ── Ключі chrome.storage.local ───────────────────────────────────────────────
export const STORAGE = {
  // Налаштування (дзеркаляться з бекендом, коли користувач залогінений)
  apiKey: 'apiKey',
  sourceLang: 'sourceLang',
  targetLang: 'targetLang',
  model: 'model',

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
  STORAGE.model
] as const;

// Чи зачепили зміни storage хоч один із перелічених ключів.
export function touched(
  changes: Record<string, chrome.storage.StorageChange>,
  keys: readonly string[]
): boolean {
  return keys.some((key) => key in changes);
}
