// Subtitle Translator — UI-рядки
// L-10: одне місце для всіх текстів — мінімум для майбутньої локалізації

export const MESSAGES = {
  loadButtonIdle: 'Завантажити SRT',
  loadButtonLoaded: (count: number) => `${count} субтитрів`,
  parseError: 'Не вдалося розпарсити субтитри. Перевір що це валідний .srt/.vtt файл.',
  fileReadError: (msg: string) => `Помилка читання файлу: ${msg}`,
  fileTooLarge: (sizeMb: string) => `Файл завеликий (${sizeMb} МБ). Максимум — 5 МБ.`,
  videoNotFound: 'Відео плеєр не знайдено на сторінці',
  offsetIndicator: (offset: number) =>
    `Зсув: ${offset >= 0 ? '+' : ''}${offset.toFixed(1)}с  ([ ] для зміни, \\ — скинути)`,
  translating: 'Перекладаю...',
  tooltipAriaLabel: 'Переклад',
  saveWord: '⭐ Зберегти',
  saveWordSaving: 'Зберігаю…',
  saveWordDone: '✓ Збережено',
  saveWordFailed: '✕ Не збережено',
  close: 'Закрити',
  phraseLabel: 'Фраза:',
  sentenceLabel: 'Рядок:',
  // YouTube: getSubtitleSource() — автозавантаження рідних субтитрів.
  // Розрізнення станів (siteAdapters.ts, fetchYouTubeCues): noCaptions —
  // після усіх повторів bridge не бачить жодного треку (субтитрів справді
  // немає); loadFailed — треки є, але timedtext не віддав валідного тіла
  // жодному кандидату (типово — потрібен pot-token).
  subtitlesUnavailable: 'Субтитри недоступні для цього відео', // noCaptions
  subtitlesLoadError: 'Не вдалося завантажити субтитри', // loadFailed
  subtitleFallbackLanguage: (lang: string) =>
    `Показано субтитри мовою "${lang}" — обрана мова недоступна для цього відео`,
  // Частина 2: in-page панель налаштувань + кнопка в панелі плеєра
  settingsButtonLabel: 'Налаштування перекладача субтитрів',
  settingsPanelAriaLabel: 'Налаштування перекладача субтитрів',
  settingsApiKeyRequired: 'Введіть API ключ',
  settingsSaved: '✓ Збережено',
  // Акаунт / синхронізація (backendAuth.ts, authClient.ts)
  accountLoggedOut: 'Не увійдено',
  accountLoggedIn: (email: string) => email,
  accountLoginBtn: 'Увійти через Google',
  accountLogoutBtn: 'Вийти',
  accountBusy: '…',
  accountLoginFailed: 'Не вдалося увійти'
};
