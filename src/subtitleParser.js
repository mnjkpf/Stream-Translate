// Subtitle Translator — парсер субтитрів (SRT/VTT)
// Чиста логіка без DOM/chrome.* API, тому файл підключається двома способами:
//   1) як звичайний content-script (manifest.json → js) — тоді результат
//      висить на self.SubtitleParser;
//   2) через require() у Node для юніт-тестів (tests/run.js) — тоді
//      спрацьовує гілка module.exports.
// Це навмисно не npm-пакет і не ES-модуль: проєкт лишається без збірки.

(function (factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    self.SubtitleParser = factory();
  }
})(function () {
  'use strict';

  // Спільне чищення тексту cue для SRT і VTT: обидва формати можуть містити
  // HTML-подібні теги (<i>, <b>, <v Speaker>, VTT karaoke-таймкоди <00:00:01.000>)
  // і ASS-теги ({\an8} тощо) — жоден з них нам не потрібен, малюємо простий текст.
  function cleanCueText(raw) {
    return raw
      .replace(/<[^>]+>/g, '')
      .replace(/\{[^}]+\}/g, '')
      .trim();
  }

  function toSeconds(h, m, s, ms) {
    return (+h || 0) * 3600 + (+m) * 60 + (+s) + (+ms) / 1000;
  }

  // L-13: сортуємо за часом старту — без цього findCueAt() у sync.js
  // залежав від порядку блоків у файлі, а не від реального таймингу
  // (перекриті/несортовані cues давали недетермінований вибір).
  function sortCues(cues) {
    return cues.slice().sort((a, b) => a.start - b.start || a.end - b.end);
  }

  function parseSRT(text) {
    text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
    // L-13: /\n\s*\n+/ замість /\n\n+/ — розділювач з пробілами/табами на
    // "порожньому" рядку раніше не розбивав блоки
    const blocks = text.split(/\n\s*\n+/);
    const cues = [];

    for (const block of blocks) {
      const lines = block.split('\n');
      if (lines.length < 2) continue;

      // L-13: шукаємо рядок з "-->" по всьому блоку, а не лише lines[0]/[1] —
      // стійкіше до сміттєвих/порожніх рядків перед індексом чи таймингом
      const timingLineIdx = lines.findIndex(l => l.includes('-->'));
      if (timingLineIdx === -1) continue;

      const m = lines[timingLineIdx].match(
        /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/
      );
      if (!m) continue;

      const start = toSeconds(m[1], m[2], m[3], m[4]);
      const end = toSeconds(m[5], m[6], m[7], m[8]);
      if (end < start) continue; // захист від зіпсованих таймінгів

      const cueText = cleanCueText(lines.slice(timingLineIdx + 1).join('\n'));
      if (cueText) cues.push({ start, end, text: cueText });
    }

    return sortCues(cues);
  }

  // M-8: WebVTT — інший заголовок, інший роздільник мс (тільки '.'),
  // необов'язкові години, NOTE/STYLE/REGION-блоки без cue, cue-налаштування
  // (align:middle line:90% тощо) в кінці timing-рядка.
  function parseVTT(text) {
    text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
    const blocks = text.split(/\n\s*\n+/);
    const cues = [];

    for (const block of blocks) {
      const lines = block.split('\n');
      if (lines.length === 0) continue;
      // Заголовок WEBVTT і блоки метаданих не містять cue — пропускаємо цілий блок
      if (/^(WEBVTT|NOTE|STYLE|REGION)\b/.test(lines[0].trim())) continue;

      const timingLineIdx = lines.findIndex(l => l.includes('-->'));
      if (timingLineIdx === -1) continue;

      // Години необов'язкові (MM:SS.mmm --> MM:SS.mmm теж валідно).
      // Хвіст рядка (cue-налаштування) свідомо не захоплюється — ми не
      // позиціонуємо субтитри по VTT-координатах.
      const m = lines[timingLineIdx].match(
        /(?:(\d{1,2}):)?(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})\.(\d{3})/
      );
      if (!m) continue;

      const start = toSeconds(m[1] || 0, m[2], m[3], m[4]);
      const end = toSeconds(m[5] || 0, m[6], m[7], m[8]);
      if (end < start) continue;

      const cueText = cleanCueText(lines.slice(timingLineIdx + 1).join('\n'));
      if (cueText) cues.push({ start, end, text: cueText });
    }

    return sortCues(cues);
  }

  // M-8: визначаємо формат за вмістом файлу, а не за розширенням — WEBVTT
  // завжди починається з цього заголовка (можливо, після BOM), інакше
  // вважаємо, що це SRT.
  function parseSubtitles(text) {
    const trimmed = text.replace(/^\uFEFF/, '').trim();
    if (/^WEBVTT/.test(trimmed)) {
      return parseVTT(text);
    }
    return parseSRT(text);
  }

  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  // YouTube json3 (timedtext ?fmt=json3) \u2014 \u0434\u0438\u0432. CLAUDE_CODE_BRIEF_YOUTUBE.md \u00A76.F
  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

  // json3 \u0456\u043D\u043A\u043E\u043B\u0438 \u043C\u0456\u0441\u0442\u0438\u0442\u044C \u043E\u043A\u0440\u0435\u043C\u0438\u0439 event \u043B\u0438\u0448\u0435 \u0437 "\n" (\u0440\u043E\u0437\u0434\u0456\u043B\u044C\u043D\u0438\u043A-\u0430\u0440\u0442\u0435\u0444\u0430\u043A\u0442) \u0456
  // \u043F\u043E\u0434\u0432\u043E\u0454\u043D\u0456 \u043F\u0440\u043E\u0431\u0456\u043B\u0438 \u0437 \u043A\u043E\u043D\u043A\u0430\u0442\u0435\u043D\u0430\u0446\u0456\u0457 \u0441\u0435\u0433\u043C\u0435\u043D\u0442\u0456\u0432 \u2014 \u043F\u0440\u0438\u0431\u0438\u0440\u0430\u0454\u043C\u043E \u0457\u0445, \u0430\u043B\u0435 \u043B\u0438\u0448\u0430\u0454\u043C\u043E
  // \u043D\u0430\u0432\u043C\u0438\u0441\u043D\u0456 \u043F\u0435\u0440\u0435\u043D\u043E\u0441 \u0440\u044F\u0434\u043A\u0456\u0432 \u043C\u0456\u0436 \u0440\u044F\u0434\u043A\u0430\u043C\u0438 \u0431\u0430\u0433\u0430\u0442\u043E\u0440\u044F\u0434\u043A\u043E\u0432\u043E\u0433\u043E cue.
  function normalizeYouTubeCueText(raw) {
    return cleanCueText(raw)
      .replace(/\n{2,}/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .join('\n');
  }

  // ASR-\u043D\u0430\u043A\u0430\u0442: \u0430\u0432\u0442\u043E\u0433\u0435\u043D\u0435\u0440\u043E\u0432\u0430\u043D\u0456 \u0441\u0443\u0431\u0442\u0438\u0442\u0440\u0438 YouTube \u043F\u0435\u0440\u0435\u043F\u0440\u0438\u0441\u0438\u043B\u0430\u044E\u0442\u044C "\u0436\u0438\u0432\u0438\u0439" \u0440\u044F\u0434\u043E\u043A
  // \u043F\u043E\u0432\u0442\u043E\u0440\u043D\u043E \u043D\u0430 \u043A\u043E\u0436\u0435\u043D \u043D\u043E\u0432\u0438\u0439 event, \u0449\u043E\u0440\u0430\u0437\u0443 \u0442\u0440\u043E\u0445\u0438 \u0434\u043E\u0432\u0448\u0438\u0439 (\u043D\u043E\u0432\u0435 \u0441\u043B\u043E\u0432\u043E \u0432 \u043A\u0456\u043D\u0446\u0456) \u2014
  // \u0431\u0435\u0437 \u0434\u0435\u0434\u0443\u043F\u0443 overlay \u0431\u043B\u0438\u043C\u0430\u0432 \u0431\u0438 \u0434\u0443\u0431\u043B\u044F\u043C\u0438 \u043A\u043E\u0436\u043D\u0456 ~200 \u043C\u0441. \u0421\u0442\u0440\u0430\u0442\u0435\u0433\u0456\u044F: cues
  // \u0439\u0434\u0443\u0442\u044C \u043F\u043E \u043F\u043E\u0440\u044F\u0434\u043A\u0443 \u0441\u0442\u0430\u0440\u0442\u0443; \u044F\u043A\u0449\u043E \u0442\u0435\u043A\u0441\u0442 \u0441\u0443\u0441\u0456\u0434\u043D\u044C\u043E\u0433\u043E event \u0454 \u0440\u043E\u0437\u0448\u0438\u0440\u0435\u043D\u043D\u044F\u043C
  // (\u0447\u0438 \u0437\u0432\u0443\u0436\u0435\u043D\u043D\u044F\u043C) \u043F\u043E\u043F\u0435\u0440\u0435\u0434\u043D\u044C\u043E\u0433\u043E \u2014 \u0446\u0435 \u0442\u0435 \u0441\u0430\u043C\u0435 "\u043D\u0430\u043A\u0430\u0442\u043D\u0435" \u0440\u0435\u0447\u0435\u043D\u043D\u044F, \u0437\u043B\u0438\u0432\u0430\u0454\u043C\u043E
  // \u0432 \u043E\u0434\u0438\u043D cue \u0437\u0430\u043C\u0456\u0441\u0442\u044C \u0434\u0432\u043E\u0445. \u042F\u043A\u0449\u043E \u0442\u0435\u043A\u0441\u0442 \u0433\u0435\u0442\u044C \u0456\u043D\u0448\u0438\u0439 \u2014 \u0446\u0435 \u043D\u043E\u0432\u0438\u0439 \u0440\u044F\u0434\u043E\u043A.
  function dedupeYouTubeAsrCues(cues) {
    const result = [];

    for (const cue of cues) {
      const prev = result[result.length - 1];

      if (prev) {
        if (cue.text === prev.text) {
          prev.end = Math.max(prev.end, cue.end);
          continue;
        }
        if (cue.text.includes(prev.text)) {
          // \u041D\u0430\u0441\u0442\u0443\u043F\u043D\u0438\u0439 event \u2014 \u0442\u0435 \u0441\u0430\u043C\u0435 \u0440\u0435\u0447\u0435\u043D\u043D\u044F, \u0430\u043B\u0435 \u0437 \u0434\u043E\u043F\u0438\u0441\u0430\u043D\u0438\u043C \u0445\u0432\u043E\u0441\u0442\u043E\u043C
          prev.text = cue.text;
          prev.end = Math.max(prev.end, cue.end);
          continue;
        }
        if (prev.text.includes(cue.text)) {
          // \u041D\u0430\u0441\u0442\u0443\u043F\u043D\u0438\u0439 event \u2014 \u043F\u0456\u0434\u043C\u043D\u043E\u0436\u0438\u043D\u0430 \u0432\u0436\u0435 \u043F\u043E\u043A\u0430\u0437\u0430\u043D\u043E\u0433\u043E \u0442\u0435\u043A\u0441\u0442\u0443 (\u0437\u0430\u043F\u0456\u0437\u043D\u0456\u043B\u0438\u0439 \u0434\u0443\u0431\u043B\u044C)
          prev.end = Math.max(prev.end, cue.end);
          continue;
        }
      }

      result.push({ start: cue.start, end: cue.end, text: cue.text });
    }

    return result;
  }

  function parseYouTubeJson3(json) {
    if (typeof json === 'string') {
      try {
        json = JSON.parse(json);
      } catch (err) {
        return [];
      }
    }

    const events = (json && Array.isArray(json.events)) ? json.events : [];
    const rawCues = [];

    for (const ev of events) {
      // Events \u0431\u0435\u0437 segs \u2014 \u0446\u0435 \u0442\u0430\u0439\u043C\u0438\u043D\u0433-/\u0441\u0442\u0438\u043B\u044C-\u043C\u0430\u0440\u043A\u0435\u0440\u0438 (\u043F\u043E\u0437\u0438\u0446\u0456\u044F \u0432\u0456\u043A\u043D\u0430 \u0442\u043E\u0449\u043E), \u043D\u0435 cue
      if (!ev || !Array.isArray(ev.segs) || ev.segs.length === 0) continue;
      if (typeof ev.tStartMs !== 'number') continue;

      const text = normalizeYouTubeCueText(ev.segs.map(seg => seg.utf8 || '').join(''));
      if (!text) continue;

      const start = ev.tStartMs / 1000;
      const durationMs = typeof ev.dDurationMs === 'number' ? ev.dDurationMs : 0;
      const end = start + durationMs / 1000;
      if (end < start) continue;

      rawCues.push({ start, end, text });
    }

    return dedupeYouTubeAsrCues(sortCues(rawCues));
  }

  return { parseSRT, parseVTT, parseSubtitles, parseYouTubeJson3 };
});
