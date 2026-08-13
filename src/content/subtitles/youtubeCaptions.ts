// Subtitle Translator — чиста логіка вибору/парсингу YouTube-субтитрів
// Винесено окремо від src/siteAdapters.ts, щоб покрити тестами (tests/run.js)
// без DOM/chrome.* — самі HTTP-запити (fetch до timedtext, postMessage до
// ytBridge) лишаються в siteAdapters.ts, сюди винесена лише чиста логіка.

export interface CaptionTrack {
  languageCode: string;
  kind: string;
  name: string;
  baseUrl: string;
}

// sourceLang у налаштуваннях — повна назва мови (див. popup.html), а трек
// YouTube ідентифікується ISO-кодом (languageCode) — зіставляємо.
export const LANGUAGE_CODE_MAP: Record<string, string> = {
  English: 'en',
  Russian: 'ru',
  Spanish: 'es',
  French: 'fr',
  German: 'de'
};

export interface CaptionCandidatesResult {
  candidates: CaptionTrack[];
  isFallback: boolean;
}

// §1.2.B (CLAUDE_CODE_BRIEF_YT_FIXES.md): пріоритет — точна мова й ручні
// субтитри над ASR. Якщо точної мови немає, беремо будь-який трек і
// позначаємо isFallback (toast-підказка). Повертає впорядкований СПИСОК
// кандидатів, а не єдиний трек, — виклик перебирає їх усіх, якщо перший
// дасть порожньо/помилку (замість одразу здаватись).
export function buildCaptionCandidates(
  tracks: CaptionTrack[] | null | undefined,
  sourceLang: string
): CaptionCandidatesResult {
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
export function parseTimedtextBody(text: string | null | undefined): unknown {
  if (!text || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    return null;
  }
}

export interface PollFetchResult {
  videoId: string | null;
  tracks: CaptionTrack[];
}

export interface PollOptions {
  attempts?: number;
  delayMs?: number;
  delayFn?: (ms: number) => Promise<void>;
}

// §1.2.B: полінг до готовності — до `attempts` спроб з паузою `delayMs`
// між ними (дефолт ~8×500мс ≈ 4-5с), поки не отримаємо непорожні tracks,
// чий videoId збігається з очікуваним. Усуває "недоступні" при SPA-
// навігації, коли bridge ще не встиг побачити плеєр нового відео.
// fetchOnce/delayFn ін'єктуються — тестується без реальних таймерів/DOM.
export async function pollForMatchingTracks(
  fetchOnce: () => Promise<PollFetchResult>,
  expectedVideoId: string | null | undefined,
  options?: PollOptions
): Promise<CaptionTrack[]> {
  const attempts = options?.attempts || 8;
  const delayMs = options?.delayMs || 500;
  const delayFn = options?.delayFn || ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));

  for (let attempt = 0; attempt < attempts; attempt++) {
    const result = await fetchOnce();
    const tracks = result?.tracks || [];
    const videoId = result?.videoId;

    if (tracks.length > 0 && (!expectedVideoId || videoId === expectedVideoId)) {
      return tracks;
    }

    if (attempt < attempts - 1) {
      await delayFn(delayMs);
    }
  }

  return [];
}
