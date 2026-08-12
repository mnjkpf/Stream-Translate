// Subtitle Translator — парсер субтитрів (SRT/VTT/YouTube json3)

export interface Cue {
  start: number;
  end: number;
  text: string;
}

const BOM_CODE_POINT = 0xfeff;

// Файли субтитрів часто починаються з BOM (Byte Order Mark) — прибираємо
// його перед подальшим парсингом, інакше він потрапляє в перший рядок.
function stripBom(text: string): string {
  return text.charCodeAt(0) === BOM_CODE_POINT ? text.slice(1) : text;
}

// Спільне чищення тексту cue для SRT і VTT: обидва формати можуть містити
// HTML-подібні теги (<i>, <b>, <v Speaker>, VTT karaoke-таймкоди <00:00:01.000>)
// і ASS-теги ({\an8} тощо) — жоден з них нам не потрібен, малюємо простий текст.
function cleanCueText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, '')
    .replace(/\{[^}]+\}/g, '')
    .trim();
}

function toSeconds(h: number | string, m: number | string, s: number | string, ms: number | string): number {
  return (+h || 0) * 3600 + (+m) * 60 + (+s) + (+ms) / 1000;
}

// L-13: сортуємо за часом старту — без цього findCueAt() у sync.js
// залежав від порядку блоків у файлі, а не від реального таймингу
// (перекриті/несортовані cues давали недетермінований вибір).
function sortCues(cues: Cue[]): Cue[] {
  return cues.slice().sort((a, b) => a.start - b.start || a.end - b.end);
}

export function parseSRT(text: string): Cue[] {
  text = stripBom(text).replace(/\r\n/g, '\n').trim();
  // L-13: /\n\s*\n+/ замість /\n\n+/ — розділювач з пробілами/табами на
  // "порожньому" рядку раніше не розбивав блоки
  const blocks = text.split(/\n\s*\n+/);
  const cues: Cue[] = [];

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
export function parseVTT(text: string): Cue[] {
  text = stripBom(text).replace(/\r\n/g, '\n').trim();
  const blocks = text.split(/\n\s*\n+/);
  const cues: Cue[] = [];

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
export function parseSubtitles(text: string): Cue[] {
  const trimmed = stripBom(text).trim();
  if (/^WEBVTT/.test(trimmed)) {
    return parseVTT(text);
  }
  return parseSRT(text);
}

// YouTube json3 (timedtext ?fmt=json3) — див. CLAUDE_CODE_BRIEF_YOUTUBE.md §6.F
//
// json3 інколи містить окремий event лише з "\n" (роздільник-артефакт) і
// подвоєні пробіли з конкатенації сегментів — приберамо їх, але лишаємо
// навмисні переноси рядків між рядками багаторядкового cue.
function normalizeYouTubeCueText(raw: string): string {
  return cleanCueText(raw)
    .replace(/\n{2,}/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n');
}

interface YouTubeJson3Segment {
  utf8?: string;
}

interface YouTubeJson3Event {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: YouTubeJson3Segment[];
  wpWinPosId?: number;
}

interface YouTubeJson3Doc {
  events?: YouTubeJson3Event[];
}

// ASR-накат: автогенеровані субтитри YouTube переписують "живий" рядок
// повторно на кожен новий event, щораз трохи довший (нове слово в кінці) —
// без дедупу overlay блимав би дублями кожні ~200 мс. Стратегія: cues
// йдуть по порядку старту; якщо текст сусіднього event є розширенням
// (чи звуженням) попереднього — це те саме "накатне" речення, зливаємо
// в один cue замість двох. Якщо текст геть інший — це новий рядок.
function dedupeYouTubeAsrCues(cues: Cue[]): Cue[] {
  const result: Cue[] = [];

  for (const cue of cues) {
    const prev = result[result.length - 1];

    if (prev) {
      if (cue.text === prev.text) {
        prev.end = Math.max(prev.end, cue.end);
        continue;
      }
      if (cue.text.includes(prev.text)) {
        // Наступний event — те саме речення, але з дописаним хвостом
        prev.text = cue.text;
        prev.end = Math.max(prev.end, cue.end);
        continue;
      }
      if (prev.text.includes(cue.text)) {
        // Наступний event — підмножина вже показаного тексту (запізнілий дубль)
        prev.end = Math.max(prev.end, cue.end);
        continue;
      }
    }

    result.push({ start: cue.start, end: cue.end, text: cue.text });
  }

  return result;
}

export function parseYouTubeJson3(json: unknown): Cue[] {
  if (typeof json === 'string') {
    try {
      json = JSON.parse(json);
    } catch (err) {
      return [];
    }
  }

  const doc = json as YouTubeJson3Doc | null;
  const events = (doc && Array.isArray(doc.events)) ? doc.events : [];
  const rawCues: Cue[] = [];

  for (const ev of events) {
    // Events без segs — це таймінг-/стиль-маркери (позиція вікна тощо), не cue
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
