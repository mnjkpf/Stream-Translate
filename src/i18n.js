// HDRezka Subtitle Translator — UI-рядки
// L-10: одне місце для всіх текстів — мінімум для майбутньої локалізації

(() => {
  'use strict';

  const TR = window.__hdrezkaTr;
  if (!TR || !TR.adapter) return; // сайт не підтримується — модуль мовчить

  TR.MESSAGES = {
    loadButtonIdle: 'Завантажити SRT',
    loadButtonLoaded: (count) => `${count} субтитрів`,
    parseError: 'Не вдалося розпарсити субтитри. Перевір що це валідний .srt/.vtt файл.',
    fileReadError: (msg) => `Помилка читання файлу: ${msg}`,
    fileTooLarge: (sizeMb) => `Файл завеликий (${sizeMb} МБ). Максимум — 5 МБ.`,
    videoNotFound: 'Відео плеєр не знайдено на сторінці',
    offsetIndicator: (offset) =>
      `Зсув: ${offset >= 0 ? '+' : ''}${offset.toFixed(1)}с  ([ ] для зміни, \\ — скинути)`,
    translating: 'Перекладаю...',
    tooltipAriaLabel: 'Переклад',
    saveWord: '⭐ Зберегти',
    saveWordDone: '✓ Збережено',
    close: 'Закрити',
    phraseLabel: 'Фраза:',
    // YouTube: getSubtitleSource() — автозавантаження рідних субтитрів.
    // Розрізнення станів (siteAdapters.js, fetchYouTubeCues): noCaptions —
    // після усіх повторів bridge не бачить жодного треку (субтитрів справді
    // немає); loadFailed — треки є, але timedtext не віддав валідного тіла
    // жодному кандидату (типово — потрібен pot-token).
    subtitlesUnavailable: 'Субтитри недоступні для цього відео', // noCaptions
    subtitlesLoadError: 'Не вдалося завантажити субтитри', // loadFailed
    subtitleFallbackLanguage: (lang) =>
      `Показано субтитри мовою "${lang}" — обрана мова недоступна для цього відео`,
    // Частина 2: in-page панель налаштувань + кнопка в панелі плеєра
    settingsButtonLabel: 'Налаштування перекладача субтитрів',
    settingsPanelAriaLabel: 'Налаштування перекладача субтитрів',
    settingsApiKeyRequired: 'Введіть API ключ',
    settingsSaved: '✓ Збережено'
  };
})();
