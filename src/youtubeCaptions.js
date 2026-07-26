// Subtitle Translator — чиста логіка вибору/парсингу YouTube-субтитрів
// Винесено з src/siteAdapters.js, щоб покрити тестами (tests/run.js) без
// DOM/chrome.* — той самий дуальний експорт, що й subtitleParser.js/cacheKey.js:
//   1) як звичайний content-script — результат висить на self.YouTubeCaptions;
//   2) через require() у Node для юніт-тестів — спрацьовує module.exports.

(function (factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    self.YouTubeCaptions = factory();
  }
})(function () {
  'use strict';

  // sourceLang у налаштуваннях — повна назва мови (див. popup.html), а трек
  // YouTube ідентифікується ISO-кодом (languageCode) — зіставляємо.
  const LANGUAGE_CODE_MAP = {
    English: 'en',
    Russian: 'ru',
    Spanish: 'es',
    French: 'fr',
    German: 'de'
  };

  // §1.2.B (CLAUDE_CODE_BRIEF_YT_FIXES.md): пріоритет — точна мова й ручні
  // субтитри над ASR. Якщо точної мови немає, беремо будь-який трек і
  // позначаємо isFallback (toast-підказка). Повертає впорядкований СПИСОК
  // кандидатів, а не єдиний трек, — виклик перебирає їх усіх, якщо перший
  // дасть порожньо/помилку (замість одразу здаватись).
  function buildCaptionCandidates(tracks, sourceLang) {
    if (!tracks || tracks.length === 0) return { candidates: [], isFallback: false };

    const wantedCode = LANGUAGE_CODE_MAP[sourceLang] || null;
    const matches = wantedCode
      ? tracks.filter(t => t.languageCode === wantedCode || t.languageCode.startsWith(wantedCode + '-'))
      : [];

    const pool = matches.length > 0 ? matches : tracks;
    const isFallback = matches.length === 0;

    const manual = pool.filter(t => t.kind !== 'asr');
    const asr = pool.filter(t => t.kind === 'asr');

    return { candidates: [...manual, ...asr], isFallback };
  }

  // §1.2.B: YouTube для api/timedtext часто віддає HTTP 200 з порожнім або
  // не-JSON тілом (типово — потрібен pot-token / інша сесія). Не кидаємо
  // виняток — це трактується як "цей трек не спрацював", виклик пробує
  // наступного кандидата, перш ніж визнати субтитри недоступними.
  function parseTimedtextBody(text) {
    if (!text || !text.trim()) return null;
    try {
      return JSON.parse(text);
    } catch (err) {
      return null;
    }
  }

  // §1.2.B: полінг до готовності — до `attempts` спроб з паузою `delayMs`
  // між ними (дефолт ~8×500мс ≈ 4-5с), поки не отримаємо непорожні tracks,
  // чий videoId збігається з очікуваним. Усуває "недоступні" при SPA-
  // навігації, коли bridge ще не встиг побачити плеєр нового відео.
  // fetchOnce/delayFn ін'єктуються — тестується без реальних таймерів/DOM.
  async function pollForMatchingTracks(fetchOnce, expectedVideoId, options) {
    const attempts = (options && options.attempts) || 8;
    const delayMs = (options && options.delayMs) || 500;
    const delayFn = (options && options.delayFn) || (ms => new Promise(resolve => setTimeout(resolve, ms)));

    for (let attempt = 0; attempt < attempts; attempt++) {
      const result = await fetchOnce();
      const tracks = (result && result.tracks) || [];
      const videoId = result && result.videoId;

      if (tracks.length > 0 && (!expectedVideoId || videoId === expectedVideoId)) {
        return tracks;
      }

      if (attempt < attempts - 1) {
        await delayFn(delayMs);
      }
    }

    return [];
  }

  return { LANGUAGE_CODE_MAP, buildCaptionCandidates, parseTimedtextBody, pollForMatchingTracks };
});
