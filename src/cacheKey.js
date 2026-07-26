// Subtitle Translator — побудова ключа кешу перекладів
// Той самий UMD-шаблон, що й subtitleParser.js: підключається в background.js
// через importScripts('src/cacheKey.js') і require()-иться з Node у юніт-тестах
// (tests/run.js), без бандлера.

(function (factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    self.CacheKeyUtil = factory();
  }
})(function () {
  'use strict';

  // Некриптографічний хеш (FNV-1a) — достатньо для ключа кешу, не для безпеки
  function hashString(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
  }

  // H-1: ключ без mode призводив до колізій між word- і phrase-перекладом
  // одного тексту, а без context — те саме слово з різних речень поверталo
  // перший-ліпший закешований сенс. Обидва тепер входять у ключ.
  function buildCacheKey(prefix, mode, sourceLang, targetLang, text, context) {
    const normalizedText = text.toLowerCase().trim();
    const contextHash = hashString((context || '').toLowerCase().trim());
    return `${prefix}${mode}:${sourceLang}:${targetLang}:${contextHash}:${normalizedText}`;
  }

  return { hashString, buildCacheKey };
});
