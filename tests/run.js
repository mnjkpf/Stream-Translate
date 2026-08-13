// Юніт-тести для чистих функцій (subtitleParser.ts, cacheKey.ts, youtubeCaptions.ts).
// Запуск: npm run build && node tests/run.js (або просто npm test — pretest
// сам викликає build). Джерела — TypeScript з реальним export, тому Node
// require()-ить не src/, а зібрані CJS-бандли з dist/test/ (build.mjs) —
// без tsx чи інших рантайм-залежностей понад typescript/esbuild.

'use strict';

const assert = require('assert');
const path = require('path');

const DIST_TEST_DIR = path.join(__dirname, '..', 'dist', 'test');

let subtitleParser, cacheKey, youtubeCaptions, pronunciationMatch;
try {
  subtitleParser = require(path.join(DIST_TEST_DIR, 'subtitleParser.js'));
  cacheKey = require(path.join(DIST_TEST_DIR, 'cacheKey.js'));
  youtubeCaptions = require(path.join(DIST_TEST_DIR, 'youtubeCaptions.js'));
  pronunciationMatch = require(path.join(DIST_TEST_DIR, 'pronunciationMatch.js'));
} catch (err) {
  console.error('Не вдалося завантажити зібрані модулі з dist/test/. Спочатку запусти: npm run build');
  console.error(err.message);
  process.exit(1);
}

const { parseSRT, parseVTT, parseSubtitles, parseYouTubeJson3 } = subtitleParser;
const { hashString, buildCacheKey } = cacheKey;
const { LANGUAGE_CODE_MAP, buildCaptionCandidates, parseTimedtextBody, pollForMatchingTracks } = youtubeCaptions;
const { comparePronunciation, normalizeWord, words } = pronunciationMatch;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL - ${name}`);
    console.error(`         ${err.message}`);
  }
}

// Асинхронний варіант test() — потрібен лише для pollForMatchingTracks
// (реальні await-переходи між спробами); той самий облік passed/failed
// та той самий формат виводу, що й у синхронному test().
async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL - ${name}`);
    console.error(`         ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════
// parseSRT
// ═══════════════════════════════════════════════════════════
console.log('parseSRT');

test('parses an indexed block', () => {
  const srt = [
    '1',
    '00:00:01,000 --> 00:00:02,500',
    'Hello world'
  ].join('\n');
  const cues = parseSRT(srt);
  assert.strictEqual(cues.length, 1);
  assert.strictEqual(cues[0].start, 1);
  assert.strictEqual(cues[0].end, 2.5);
  assert.strictEqual(cues[0].text, 'Hello world');
});

test('parses a non-indexed block (no index line)', () => {
  const srt = '00:00:03,000 --> 00:00:04,000\nNo index here';
  const cues = parseSRT(srt);
  assert.strictEqual(cues.length, 1);
  assert.strictEqual(cues[0].text, 'No index here');
});

test('accepts both comma and dot as millisecond separator', () => {
  const srt = [
    '1',
    '00:00:01,000 --> 00:00:02,000',
    'Comma',
    '',
    '2',
    '00:00:03.000 --> 00:00:04.000',
    'Dot'
  ].join('\n');
  const cues = parseSRT(srt);
  assert.strictEqual(cues.length, 2);
  assert.strictEqual(cues[0].text, 'Comma');
  assert.strictEqual(cues[1].text, 'Dot');
});

test('sorts cues by start time regardless of file order (overlap/out-of-order)', () => {
  const srt = [
    '1',
    '00:00:10,000 --> 00:00:11,000',
    'Second in time',
    '',
    '2',
    '00:00:01,000 --> 00:00:02,000',
    'First in time'
  ].join('\n');
  const cues = parseSRT(srt);
  assert.strictEqual(cues[0].text, 'First in time');
  assert.strictEqual(cues[1].text, 'Second in time');
});

test('keeps multi-line cue text joined with \\n', () => {
  const srt = '1\n00:00:01,000 --> 00:00:02,000\nLine one\nLine two';
  const cues = parseSRT(srt);
  assert.strictEqual(cues[0].text, 'Line one\nLine two');
});

test('strips HTML and ASS tags from cue text', () => {
  const srt = '1\n00:00:01,000 --> 00:00:02,000\n{\\an8}<i>Italic</i> text';
  const cues = parseSRT(srt);
  assert.strictEqual(cues[0].text, 'Italic text');
});

test('strips ">>" speaker-change markers at the start of a line', () => {
  const srt = '1\n00:00:01,000 --> 00:00:02,000\n>> Oh my god, the apex.';
  const cues = parseSRT(srt);
  assert.strictEqual(cues[0].text, 'Oh my god, the apex.');
});

test('strips a mid-line ">>" marker without gluing the words together', () => {
  const srt = '1\n00:00:01,000 --> 00:00:02,000\nNice. >> Oh my god, the apex.';
  const cues = parseSRT(srt);
  assert.strictEqual(cues[0].text, 'Nice. Oh my god, the apex.');
});

test('strips ">>>" (new topic) the same way as ">>"', () => {
  const srt = '1\n00:00:01,000 --> 00:00:02,000\n>>> Back to the studio';
  const cues = parseSRT(srt);
  assert.strictEqual(cues[0].text, 'Back to the studio');
});

test('leaves a single ">" alone (not a speaker marker)', () => {
  const srt = '1\n00:00:01,000 --> 00:00:02,000\n5 > 3 is true';
  const cues = parseSRT(srt);
  assert.strictEqual(cues[0].text, '5 > 3 is true');
});

test('strips ">>" from YouTube json3 cues too', () => {
  const doc = {
    events: [
      { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: '>> ' }, { utf8: 'Hello there' }] }
    ]
  };
  const cues = parseYouTubeJson3(doc);
  assert.strictEqual(cues[0].text, 'Hello there');
});

test('strips a leading BOM and normalizes CRLF', () => {
  const srt = '﻿1\r\n00:00:01,000 --> 00:00:02,000\r\nWith BOM';
  const cues = parseSRT(srt);
  assert.strictEqual(cues.length, 1);
  assert.strictEqual(cues[0].text, 'With BOM');
});

test('L-13: splits blocks separated by a whitespace-only "blank" line', () => {
  const srt = '1\n00:00:01,000 --> 00:00:02,000\nFirst\n   \n2\n00:00:03,000 --> 00:00:04,000\nSecond';
  const cues = parseSRT(srt);
  assert.strictEqual(cues.length, 2);
  assert.strictEqual(cues[0].text, 'First');
  assert.strictEqual(cues[1].text, 'Second');
});

test('skips a cue with end time before start time', () => {
  const srt = '1\n00:00:05,000 --> 00:00:01,000\nBroken timing';
  const cues = parseSRT(srt);
  assert.strictEqual(cues.length, 0);
});

test('skips a garbage block with no --> line', () => {
  const srt = '1\n00:00:01,000 --> 00:00:02,000\nGood\n\njust some\nrandom junk\nwith no timing';
  const cues = parseSRT(srt);
  assert.strictEqual(cues.length, 1);
  assert.strictEqual(cues[0].text, 'Good');
});

// ═══════════════════════════════════════════════════════════
// parseVTT
// ═══════════════════════════════════════════════════════════
console.log('parseVTT');

test('skips the WEBVTT header block', () => {
  const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello';
  const cues = parseVTT(vtt);
  assert.strictEqual(cues.length, 1);
  assert.strictEqual(cues[0].text, 'Hello');
});

test('skips NOTE/STYLE/REGION blocks', () => {
  const vtt = [
    'WEBVTT',
    '',
    'NOTE this is a comment',
    '',
    'STYLE',
    '::cue { color: yellow; }',
    '',
    '00:00:01.000 --> 00:00:02.000',
    'Real cue'
  ].join('\n');
  const cues = parseVTT(vtt);
  assert.strictEqual(cues.length, 1);
  assert.strictEqual(cues[0].text, 'Real cue');
});

test('parses timestamps without an hours component', () => {
  const vtt = 'WEBVTT\n\n00:01.500 --> 00:03.000\nNo hours';
  const cues = parseVTT(vtt);
  assert.strictEqual(cues.length, 1);
  assert.strictEqual(cues[0].start, 1.5);
  assert.strictEqual(cues[0].end, 3);
});

test('parses timestamps with an hours component', () => {
  const vtt = 'WEBVTT\n\n01:00:01.000 --> 01:00:02.000\nWith hours';
  const cues = parseVTT(vtt);
  assert.strictEqual(cues[0].start, 3601);
  assert.strictEqual(cues[0].end, 3602);
});

test('ignores cue settings after the timing line', () => {
  const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000 align:middle line:90%\nPositioned cue';
  const cues = parseVTT(vtt);
  assert.strictEqual(cues.length, 1);
  assert.strictEqual(cues[0].start, 1);
  assert.strictEqual(cues[0].text, 'Positioned cue');
});

test('strips voice tags and formatting tags', () => {
  const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<v Roger>Hello <b>there</b></v>';
  const cues = parseVTT(vtt);
  assert.strictEqual(cues[0].text, 'Hello there');
});

// ═══════════════════════════════════════════════════════════
// parseSubtitles (дispatcher)
// ═══════════════════════════════════════════════════════════
console.log('parseSubtitles');

test('routes WEBVTT content to the VTT parser', () => {
  const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nVTT text';
  const cues = parseSubtitles(vtt);
  assert.strictEqual(cues[0].text, 'VTT text');
});

test('routes non-WEBVTT content to the SRT parser', () => {
  const srt = '1\n00:00:01,000 --> 00:00:02,000\nSRT text';
  const cues = parseSubtitles(srt);
  assert.strictEqual(cues[0].text, 'SRT text');
});

// ═══════════════════════════════════════════════════════════
// cacheKey (H-1)
// ═══════════════════════════════════════════════════════════
console.log('cacheKey');

test('same inputs produce the same key (deterministic)', () => {
  const k1 = buildCacheKey('tr:', 'word', 'English', 'Ukrainian', 'bank', 'I sat by the bank.');
  const k2 = buildCacheKey('tr:', 'word', 'English', 'Ukrainian', 'bank', 'I sat by the bank.');
  assert.strictEqual(k1, k2);
});

test('different mode produces a different key for the same text/context', () => {
  const wordKey = buildCacheKey('tr:', 'word', 'English', 'Ukrainian', 'run', 'context');
  const phraseKey = buildCacheKey('tr:', 'phrase', 'English', 'Ukrainian', 'run', 'context');
  assert.notStrictEqual(wordKey, phraseKey);
});

test('different context produces a different key for the same word (H-1)', () => {
  const riverKey = buildCacheKey('tr:', 'word', 'English', 'Ukrainian', 'bank', 'I sat by the river bank.');
  const moneyKey = buildCacheKey('tr:', 'word', 'English', 'Ukrainian', 'bank', 'I deposited money in the bank.');
  assert.notStrictEqual(riverKey, moneyKey);
});

test('key carries the prefix, mode, languages and lowercased text', () => {
  const key = buildCacheKey('tr:', 'word', 'English', 'Ukrainian', 'Bank', 'some context');
  assert.ok(key.startsWith('tr:word:English:Ukrainian:'));
  assert.ok(key.endsWith(':bank'));
});

test('hashString is deterministic and differs for different input', () => {
  assert.strictEqual(hashString('same'), hashString('same'));
  assert.notStrictEqual(hashString('a'), hashString('b'));
});

// ═══════════════════════════════════════════════════════════
// parseYouTubeJson3
// ═══════════════════════════════════════════════════════════
console.log('parseYouTubeJson3');

test('parses ordinary events into cues', () => {
  const json = {
    events: [
      { tStartMs: 1000, dDurationMs: 1500, segs: [{ utf8: 'Hello world' }] },
      { tStartMs: 3000, dDurationMs: 2000, segs: [{ utf8: 'Second line' }] }
    ]
  };
  const cues = parseYouTubeJson3(json);
  assert.strictEqual(cues.length, 2);
  assert.strictEqual(cues[0].start, 1);
  assert.strictEqual(cues[0].end, 2.5);
  assert.strictEqual(cues[0].text, 'Hello world');
  assert.strictEqual(cues[1].start, 3);
  assert.strictEqual(cues[1].end, 5);
});

test('skips events without segs (timing/style markers)', () => {
  const json = {
    events: [
      { tStartMs: 0, dDurationMs: 1000, wpWinPosId: 1 },
      { tStartMs: 1000, dDurationMs: 1000, segs: [] },
      { tStartMs: 2000, dDurationMs: 1000, segs: [{ utf8: 'Real cue' }] }
    ]
  };
  const cues = parseYouTubeJson3(json);
  assert.strictEqual(cues.length, 1);
  assert.strictEqual(cues[0].text, 'Real cue');
});

test('handles long videos with hour-scale timestamps', () => {
  const json = {
    events: [
      { tStartMs: 3661000, dDurationMs: 2000, segs: [{ utf8: 'One hour in' }] }
    ]
  };
  const cues = parseYouTubeJson3(json);
  assert.strictEqual(cues[0].start, 3661);
  assert.strictEqual(cues[0].end, 3663);
});

test('sorts cues by start time regardless of event order', () => {
  const json = {
    events: [
      { tStartMs: 5000, dDurationMs: 1000, segs: [{ utf8: 'Later' }] },
      { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: 'Earlier' }] }
    ]
  };
  const cues = parseYouTubeJson3(json);
  assert.strictEqual(cues[0].text, 'Earlier');
  assert.strictEqual(cues[1].text, 'Later');
});

test('dedupes ASR rolling-caption events that grow the same line', () => {
  const json = {
    events: [
      { tStartMs: 0, dDurationMs: 500, segs: [{ utf8: 'I' }] },
      { tStartMs: 200, dDurationMs: 500, segs: [{ utf8: 'I think' }] },
      { tStartMs: 400, dDurationMs: 500, segs: [{ utf8: 'I think so' }] },
      { tStartMs: 900, dDurationMs: 1000, segs: [{ utf8: 'Next sentence' }] }
    ]
  };
  const cues = parseYouTubeJson3(json);
  assert.strictEqual(cues.length, 2);
  assert.strictEqual(cues[0].text, 'I think so');
  assert.strictEqual(cues[0].start, 0);
  assert.strictEqual(cues[0].end, 0.9);
  assert.strictEqual(cues[1].text, 'Next sentence');
});

test('drops standalone newline-artifact events and normalizes whitespace', () => {
  const json = {
    events: [
      { tStartMs: 0, dDurationMs: 500, segs: [{ utf8: '\n' }] },
      { tStartMs: 500, dDurationMs: 500, segs: [{ utf8: 'Hello  ' }, { utf8: '\nworld' }] }
    ]
  };
  const cues = parseYouTubeJson3(json);
  assert.strictEqual(cues.length, 1);
  assert.strictEqual(cues[0].text, 'Hello\nworld');
});

test('returns an empty array for empty/malformed input', () => {
  assert.deepStrictEqual(parseYouTubeJson3({}), []);
  assert.deepStrictEqual(parseYouTubeJson3({ events: [] }), []);
  assert.deepStrictEqual(parseYouTubeJson3(null), []);
  assert.deepStrictEqual(parseYouTubeJson3('not json'), []);
});

test('accepts a JSON string, not just a parsed object', () => {
  const raw = JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'From string' }] }] });
  const cues = parseYouTubeJson3(raw);
  assert.strictEqual(cues.length, 1);
  assert.strictEqual(cues[0].text, 'From string');
});

// ═══════════════════════════════════════════════════════════
// buildCaptionCandidates
// ═══════════════════════════════════════════════════════════
console.log('buildCaptionCandidates');

test('exact language match: manual tracks ordered before ASR', () => {
  const tracks = [
    { languageCode: 'en', kind: 'asr', name: 'English (auto)', baseUrl: 'a' },
    { languageCode: 'en', kind: '', name: 'English', baseUrl: 'b' },
    { languageCode: 'ru', kind: '', name: 'Russian', baseUrl: 'c' }
  ];
  const { candidates, isFallback } = buildCaptionCandidates(tracks, 'English');
  assert.strictEqual(isFallback, false);
  assert.strictEqual(candidates.length, 2);
  assert.strictEqual(candidates[0].baseUrl, 'b');
  assert.strictEqual(candidates[1].baseUrl, 'a');
});

test('matches a language variant like en-US against wanted "en"', () => {
  const tracks = [
    { languageCode: 'en-US', kind: '', name: 'English (US)', baseUrl: 'a' },
    { languageCode: 'fr', kind: '', name: 'French', baseUrl: 'b' }
  ];
  const { candidates, isFallback } = buildCaptionCandidates(tracks, 'English');
  assert.strictEqual(isFallback, false);
  assert.strictEqual(candidates.length, 1);
  assert.strictEqual(candidates[0].baseUrl, 'a');
});

test('no matching language falls back to the full track list, still manual before ASR', () => {
  const tracks = [
    { languageCode: 'ja', kind: 'asr', name: 'Japanese (auto)', baseUrl: 'a' },
    { languageCode: 'de', kind: '', name: 'German', baseUrl: 'b' }
  ];
  const { candidates, isFallback } = buildCaptionCandidates(tracks, 'English');
  assert.strictEqual(isFallback, true);
  assert.strictEqual(candidates.length, 2);
  assert.strictEqual(candidates[0].baseUrl, 'b');
  assert.strictEqual(candidates[1].baseUrl, 'a');
});

test('preserves relative order within each group (manual, then asr)', () => {
  const tracks = [
    { languageCode: 'en', kind: '', name: 'English 1', baseUrl: 'm1' },
    { languageCode: 'en', kind: 'asr', name: 'English auto 1', baseUrl: 'a1' },
    { languageCode: 'en', kind: '', name: 'English 2', baseUrl: 'm2' },
    { languageCode: 'en', kind: 'asr', name: 'English auto 2', baseUrl: 'a2' }
  ];
  const { candidates } = buildCaptionCandidates(tracks, 'English');
  assert.deepStrictEqual(candidates.map(t => t.baseUrl), ['m1', 'm2', 'a1', 'a2']);
});

test('returns empty candidates and isFallback:false for an empty tracks array', () => {
  assert.deepStrictEqual(buildCaptionCandidates([], 'English'), { candidates: [], isFallback: false });
});

test('returns empty candidates and isFallback:false for undefined tracks', () => {
  assert.deepStrictEqual(buildCaptionCandidates(undefined, 'English'), { candidates: [], isFallback: false });
});

test('sourceLang missing from LANGUAGE_CODE_MAP falls back to the full track list', () => {
  const tracks = [
    { languageCode: 'en', kind: '', name: 'English', baseUrl: 'a' }
  ];
  const { candidates, isFallback } = buildCaptionCandidates(tracks, 'Klingon');
  assert.strictEqual(isFallback, true);
  assert.strictEqual(candidates.length, 1);
});

test('LANGUAGE_CODE_MAP contains the expected ISO codes', () => {
  assert.deepStrictEqual(LANGUAGE_CODE_MAP, {
    English: 'en',
    Russian: 'ru',
    Spanish: 'es',
    French: 'fr',
    German: 'de'
  });
});

// ═══════════════════════════════════════════════════════════
// parseTimedtextBody
// ═══════════════════════════════════════════════════════════
console.log('parseTimedtextBody');

test('returns null for an empty string', () => {
  assert.strictEqual(parseTimedtextBody(''), null);
});

test('returns null for a whitespace-only string', () => {
  assert.strictEqual(parseTimedtextBody('   \n\t  '), null);
});

test('returns null (not a throw) for non-JSON garbage text', () => {
  assert.strictEqual(parseTimedtextBody('not json at all {{{'), null);
});

test('returns null for null/undefined input', () => {
  assert.strictEqual(parseTimedtextBody(null), null);
  assert.strictEqual(parseTimedtextBody(undefined), null);
});

test('parses a valid JSON object string', () => {
  const result = parseTimedtextBody('{"events":[{"tStartMs":0}]}');
  assert.deepStrictEqual(result, { events: [{ tStartMs: 0 }] });
});

test('parses a valid JSON array string', () => {
  const result = parseTimedtextBody('[1,2,3]');
  assert.deepStrictEqual(result, [1, 2, 3]);
});

// ═══════════════════════════════════════════════════════════
// pollForMatchingTracks
// ═══════════════════════════════════════════════════════════
// Асинхронна функція — тестуємо через testAsync/await у власному IIFE,
// а підсумок і process.exit друкуємо лише після його завершення.
(async () => {
  console.log('pollForMatchingTracks');

  await testAsync('resolves immediately when the first attempt already matches (no delay, single fetch)', async () => {
    let fetchCalls = 0;
    const fetchOnce = async () => { fetchCalls++; return { videoId: 'abc', tracks: [{ id: 1 }] }; };
    let delayCalls = 0;
    const delayFn = async () => { delayCalls++; };

    const tracks = await pollForMatchingTracks(fetchOnce, 'abc', { delayFn });

    assert.deepStrictEqual(tracks, [{ id: 1 }]);
    assert.strictEqual(fetchCalls, 1);
    assert.strictEqual(delayCalls, 0);
  });

  await testAsync('works when options is omitted entirely and the first attempt matches', async () => {
    const fetchOnce = async () => ({ videoId: 'abc', tracks: [{ id: 1 }] });
    const tracks = await pollForMatchingTracks(fetchOnce, 'abc');
    assert.deepStrictEqual(tracks, [{ id: 1 }]);
  });

  await testAsync('retries past a videoId mismatch and an empty-tracks attempt, then matches, waiting between attempts', async () => {
    const responses = [
      { videoId: 'old', tracks: [{ id: 'stale' }] }, // wrong videoId, non-empty tracks
      { videoId: 'new', tracks: [] },                // right videoId, but empty tracks
      { videoId: 'new', tracks: [{ id: 'good' }] }   // match
    ];
    let fetchCalls = 0;
    const fetchOnce = async () => responses[fetchCalls++];
    const delayCalls = [];
    const delayFn = async (ms) => { delayCalls.push(ms); };

    const tracks = await pollForMatchingTracks(fetchOnce, 'new', { delayFn, attempts: 8, delayMs: 500 });

    assert.deepStrictEqual(tracks, [{ id: 'good' }]);
    assert.strictEqual(fetchCalls, 3);
    assert.deepStrictEqual(delayCalls, [500, 500]);
  });

  await testAsync('never matches within attempts: resolves to [], fetchOnce called `attempts` times, delayFn called `attempts - 1` times', async () => {
    let fetchCalls = 0;
    const fetchOnce = async () => { fetchCalls++; return { videoId: 'other', tracks: [] }; };
    let delayCalls = 0;
    const delayFn = async () => { delayCalls++; };

    const tracks = await pollForMatchingTracks(fetchOnce, 'expected', { attempts: 4, delayMs: 10, delayFn });

    assert.deepStrictEqual(tracks, []);
    assert.strictEqual(fetchCalls, 4);
    assert.strictEqual(delayCalls, 3);
  });

  await testAsync('falsy expectedVideoId (null or undefined) accepts the first attempt with non-empty tracks regardless of videoId', async () => {
    const fetchOnce = async () => ({ videoId: 'whatever', tracks: [{ id: 'x' }] });
    const delayFn = async () => { throw new Error('delayFn should not be called'); };

    const tracksForNull = await pollForMatchingTracks(fetchOnce, null, { delayFn });
    assert.deepStrictEqual(tracksForNull, [{ id: 'x' }]);

    const tracksForUndefined = await pollForMatchingTracks(fetchOnce, undefined, { delayFn });
    assert.deepStrictEqual(tracksForUndefined, [{ id: 'x' }]);
  });

  // ═══════════════════════════════════════════════════════════
  // comparePronunciation (практика вимови)
  // ═══════════════════════════════════════════════════════════
  console.log('comparePronunciation');

  test('perfect repeat scores 100', () => {
    const r = comparePronunciation('Oh my god, the apex.', 'oh my god the apex');
    assert.strictEqual(r.score, 100);
    assert.deepStrictEqual(r.matched, [true, true, true, true, true]);
  });

  test('ignores punctuation and case on both sides', () => {
    const r = comparePronunciation('Hello, world!', 'HELLO WORLD');
    assert.strictEqual(r.score, 100);
  });

  test('a missed word is marked at its own position, not shifting the rest', () => {
    // Розпізнавач загубив "quick" — решта слів усе одно має зарахуватись.
    const r = comparePronunciation('the quick brown fox', 'the brown fox');
    assert.deepStrictEqual(r.matched, [true, false, true, true]);
    assert.strictEqual(r.score, 75);
  });

  test('an extra inserted word does not break matching of the tail', () => {
    // Головна причина мультимножини замість позиційного зіставлення.
    const r = comparePronunciation('the brown fox', 'the very brown fox');
    assert.deepStrictEqual(r.matched, [true, true, true]);
    assert.strictEqual(r.score, 100);
  });

  test('saying a repeated word once does not satisfy both occurrences', () => {
    const r = comparePronunciation('the cat and the dog', 'the cat and dog');
    assert.deepStrictEqual(r.matched, [true, true, true, false, true]);
  });

  test('completely wrong answer scores 0', () => {
    const r = comparePronunciation('good morning', 'zzz qqq');
    assert.strictEqual(r.score, 0);
    assert.deepStrictEqual(r.matched, [false, false]);
  });

  test('empty expected text scores 0 instead of dividing by zero', () => {
    const r = comparePronunciation('', 'anything');
    assert.strictEqual(r.score, 0);
    assert.deepStrictEqual(r.expected, []);
  });

  test('empty heard text marks everything missed', () => {
    const r = comparePronunciation('two words', '');
    assert.strictEqual(r.score, 0);
    assert.deepStrictEqual(r.matched, [false, false]);
  });

  test('keeps apostrophes inside words (don\'t stays one token)', () => {
    assert.strictEqual(normalizeWord("Don't!"), "don't");
    assert.deepStrictEqual(words("I don't know"), ['i', "don't", 'know']);
  });

  test('collapses multiple spaces and newlines into clean tokens', () => {
    assert.deepStrictEqual(words('a  b\nc'), ['a', 'b', 'c']);
  });

  // ═══════════════════════════════════════════════════════════
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
