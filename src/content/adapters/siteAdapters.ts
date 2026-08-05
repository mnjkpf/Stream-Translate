// Subtitle Translator — реєстр адаптерів сайтів
// Уся платформо-специфічна логіка (пошук відео, точка монтування, fullscreen-корінь)
// живе тут. Решта коду платформо-незалежна.
//
// Щоб додати нову платформу: додати новий об'єкт з тим самим інтерфейсом
// (SiteAdapter, див. siteAdapter.ts) у SITE_ADAPTERS нижче і, за потреби,
// новий запис у manifest.json → content_scripts.matches.

import type { SiteAdapter, SubtitleFetchResult } from './siteAdapter';
import { parseYouTubeJson3, type Cue } from '../subtitles/subtitleParser';
import {
  buildCaptionCandidates,
  parseTimedtextBody,
  pollForMatchingTracks,
  type CaptionTrack,
  type PollFetchResult
} from '../subtitles/youtubeCaptions';

// ═══════════════════════════════════════════════════════════
// Спільні хелпери вибору <video>
// ═══════════════════════════════════════════════════════════

// З кількох <video> у контейнері обираємо те, що зараз відтворюється,
// інакше — найбільше за видимою площею (M-5: захист від рекламних/сторонніх <video>)
function pickBestVideo(videos: HTMLVideoElement[]): HTMLVideoElement | null {
  if (videos.length === 0) return null;
  if (videos.length === 1) return videos[0];

  const playing = videos.find(v => !v.paused && !v.ended && v.readyState > 2);
  if (playing) return playing;

  return videos.reduce<HTMLVideoElement | null>((best, v) => {
    const area = v.clientWidth * v.clientHeight;
    const bestArea = best ? best.clientWidth * best.clientHeight : -1;
    return area > bestArea ? v : best;
  }, null);
}

// ═══════════════════════════════════════════════════════════
// YouTube
// ═══════════════════════════════════════════════════════════
// Джерело субтитрів — рідні треки YouTube (ручні + ASR), не ручний SRT
// (див. CLAUDE_CODE_BRIEF_YOUTUBE.md). YouTube — SPA: той самий <video>
// перевикористовується між роликами (навігація без перезавантаження
// сторінки), тож потрібен окремий механізм детекту зміни ролика —
// observeNavigation().

const YT_BRIDGE_REQUEST_TYPE = 'subtr-yt-tracks-request';
const YT_BRIDGE_RESPONSE_TYPE = 'subtr-yt-tracks-response';
const YT_BRIDGE_TIMEOUT_MS = 4000;
const YT_HIDE_NATIVE_CLASS = 'subtr-yt-hide-native-captions';
const YT_POLL_ATTEMPTS = 8; // §1.2.B: ~8×500мс ≈ 4-5с — покриває SPA-навігацію, поки плеєр не готовий
const YT_POLL_DELAY_MS = 500;

interface BridgeResponseMessage {
  source?: string;
  type?: string;
  requestId?: string;
  videoId?: string | null;
  tracks?: CaptionTrack[];
}

// Рівень 1 (основний, §4.2): запит до ytBridge.js (MAIN world) за
// caption-треками з "живого" player response через window.postMessage —
// ISOLATED-world content script не має прямого доступу до
// window.ytInitialPlayerResponse / movie_player.getPlayerResponse().
function requestCaptionTracksFromBridge(): Promise<PollFetchResult> {
  return new Promise((resolve) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function onMessage(event: MessageEvent) {
      if (event.source !== window) return;
      const data = event.data as BridgeResponseMessage | null;
      if (!data || data.source !== 'subtr-main' || data.type !== YT_BRIDGE_RESPONSE_TYPE) return;
      if (data.requestId !== requestId) return;
      settle({ videoId: data.videoId || null, tracks: Array.isArray(data.tracks) ? data.tracks : [] });
    }

    function settle(result: PollFetchResult) {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      if (timer) clearTimeout(timer);
      resolve(result);
    }

    window.addEventListener('message', onMessage);
    // Якщо ytBridge.js з якоїсь причини не відповів (сторінка без плеєра,
    // зміни в структурі YouTube) — не блокуємо fetchCues() назавжди
    timer = setTimeout(() => settle({ videoId: null, tracks: [] }), YT_BRIDGE_TIMEOUT_MS);

    window.postMessage(
      { source: 'subtr-isolated', type: YT_BRIDGE_REQUEST_TYPE, requestId },
      location.origin
    );
  });
}

// §1.2.B: один трек, одна спроба timedtext. Порожнє/не-JSON тіло (типова
// pot-token-відмова) — НЕ виняток, а сигнал "цей трек не спрацював", щоб
// виклик спробував наступного кандидата, перш ніж здатись.
async function fetchTrackCues(track: CaptionTrack): Promise<Cue[] | null> {
  const sep = track.baseUrl.includes('?') ? '&' : '?';
  const url = `${track.baseUrl}${sep}fmt=json3`;

  let resp: Response;
  try {
    resp = await fetch(url, { credentials: 'include' });
  } catch (err) {
    console.warn(`[Subtitle Translator] YouTube: timedtext fetch впав мережево для ${track.languageCode || '?'}`, err);
    return null;
  }

  if (!resp.ok) {
    console.warn(`[Subtitle Translator] YouTube: timedtext HTTP ${resp.status} для ${track.languageCode || '?'}`);
    return null;
  }

  const text = await resp.text();
  const json = parseTimedtextBody(text);
  if (json === null) {
    console.warn(`[Subtitle Translator] YouTube: timedtext порожнє/не-JSON тіло для ${track.languageCode || '?'} (типово — потрібен pot-token)`);
    return null;
  }

  const cues = parseYouTubeJson3(json);
  if (cues.length === 0) {
    console.warn(`[Subtitle Translator] YouTube: timedtext розпарсився без cues для ${track.languageCode || '?'}`);
    return null;
  }

  return cues;
}

async function fetchYouTubeCues(): Promise<SubtitleFetchResult> {
  const expectedVideoId = getVideoIdFromUrl();
  const tracks = await pollForMatchingTracks(
    requestCaptionTracksFromBridge,
    expectedVideoId,
    { attempts: YT_POLL_ATTEMPTS, delayMs: YT_POLL_DELAY_MS }
  );

  if (tracks.length === 0) {
    console.warn('[Subtitle Translator] YouTube: після усіх повторів треків не знайдено (videoId не збігається або субтитрів справді немає)');
    return { cues: [], state: 'noCaptions', languageCode: null, isFallbackLanguage: false, isAsr: false };
  }

  const settings = await chrome.storage.local.get('sourceLang');
  const sourceLang = settings.sourceLang || 'English';
  const { candidates, isFallback } = buildCaptionCandidates(tracks, sourceLang);

  // §1.2.B: пробуємо кандидатів по черзі (інші треки тієї ж мови, потім
  // ASR) — якщо обраний трек дав порожньо/помилку, а не одразу здаємось.
  for (const track of candidates) {
    if (!track.baseUrl) continue;
    const cues = await fetchTrackCues(track);
    if (cues) {
      return {
        cues,
        state: 'ok',
        languageCode: track.languageCode,
        isFallbackLanguage: isFallback,
        isAsr: track.kind === 'asr'
      };
    }
  }

  console.warn('[Subtitle Translator] YouTube: усі кандидати треків дали порожньо/помилку — timedtext, ймовірно, вимагає pot-token');
  return { cues: [], state: 'loadFailed', languageCode: null, isFallbackLanguage: false, isAsr: false };
}

// Рівень 3 (резервний, §1.2.C): коли Рівень 1 (timedtext) не зміг
// віддати cues — вмикаємо нативні субтитри YouTube і читаємо поточний
// рядок прямо з DOM, віддзеркалюючи його в overlay. Лише "жива" репліка
// без випередження і з грубшим таймінгом, зате не залежить від
// timedtext/InnerTube.
function enableNativeCaptions(): void {
  const btn = document.querySelector<HTMLElement>('.ytp-subtitles-button');
  if (btn && btn.getAttribute('aria-pressed') === 'false') {
    btn.click();
  }
}

function startDomCaptionFallback(onLineChange: (text: string) => void): (() => void) | null {
  enableNativeCaptions();

  const container = document.querySelector('.ytp-caption-window-container');
  if (!container) {
    console.warn('[Subtitle Translator] YouTube: Рівень 3 недоступний — немає .ytp-caption-window-container');
    return null;
  }

  let lastText: string | null = null;
  function readLine() {
    const text = [...container!.querySelectorAll('.ytp-caption-segment')]
      .map(el => el.textContent)
      .join('\n');
    if (text === lastText) return;
    lastText = text;
    onLineChange(text);
  }

  const obs = new MutationObserver(readLine);
  obs.observe(container, { childList: true, subtree: true, characterData: true });
  readLine();

  console.warn('[Subtitle Translator] YouTube: увімкнено Рівень 3 (DOM-скрейпінг живих субтитрів) — timedtext не віддав валідних cues');
  return () => obs.disconnect();
}

function getVideoIdFromUrl(): string | null {
  const params = new URLSearchParams(location.search);
  if (params.has('v')) return params.get('v');
  // Shorts не мають ?v=, але теж підлягають SPA-навігації
  const m = location.pathname.match(/\/shorts\/([^/?]+)/);
  return m ? m[1] : null;
}

export const YouTubeAdapter: SiteAdapter = {
  id: 'youtube',
  hosts: ['youtube.com'], // навмисно без music.youtube.com — інша розмітка плеєра, не тестувалось (exclude_matches у manifest.json)

  matchesHost(host) {
    return this.hosts.some(h => host === h || host.endsWith('.' + h));
  },

  findVideo() {
    const scope = document.querySelector('#movie_player') || document;
    const videos = [...scope.querySelectorAll('video')];
    return pickBestVideo(videos);
  },

  getMountPoint(video) {
    return document.getElementById('movie_player') || video.parentElement;
  },

  getFullscreenRoot() {
    // YouTube робить fullscreen на #movie_player, а не на document.body
    return document.fullscreenElement || document.getElementById('movie_player') || document.body;
  },

  getSubtitleSource() {
    return { fetchCues: fetchYouTubeCues };
  },

  // §5: <video> перевикористовується між роликами — детектимо зміну
  // videoId, а не появу нового елемента. yt-navigate-finish — основний
  // сигнал; спостереження за <title> — підстраховка на випадок, якщо
  // подія з якоїсь причини не диспатчнеться.
  observeNavigation(callback) {
    let lastVideoId = getVideoIdFromUrl();

    function handleChange() {
      const currentId = getVideoIdFromUrl();
      if (currentId && currentId !== lastVideoId) {
        lastVideoId = currentId;
        callback();
      }
    }

    document.addEventListener('yt-navigate-finish', handleChange);

    const titleEl = document.querySelector('title');
    if (titleEl) {
      new MutationObserver(handleChange).observe(titleEl, { childList: true });
    }
  },

  // D: ховаємо рідні субтитри YouTube, поки активний наш overlay —
  // через CSS-клас (простіше й ізольованіше за виклик
  // movie_player.setOption/unloadModule через MAIN-world міст).
  hideNativeSubtitles() {
    document.documentElement.classList.add(YT_HIDE_NATIVE_CLASS);
  },

  showNativeSubtitles() {
    document.documentElement.classList.remove(YT_HIDE_NATIVE_CLASS);
  },

  // Рівень 3 (§1.2.C) — опційний хук; інші сайти можуть його не реалізовувати.
  startCaptionFallback(onLineChange) {
    return startDomCaptionFallback(onLineChange);
  },

  // §2.3.B: вставляємо кнопку налаштувань у панель керування плеєра,
  // перед гвинтиком (.ytp-settings-button). Повертає true, якщо вдалося
  // вставити, — settingsPanel.ts звіряється з цим перед реінʼєкцією.
  placeSettingsButton(buttonEl) {
    const rightControls = document.querySelector('.ytp-right-controls');
    if (!rightControls) return false;

    buttonEl.classList.add('ytp-button', 'subtr-yt-settings-btn');

    try {
      const settingsBtn = rightControls.querySelector('.ytp-settings-button');
      // .ytp-settings-button може бути НЕ прямою дитиною .ytp-right-controls
      // (YouTube загортає кнопки у проміжні обгортки) — тоді
      // rightControls.insertBefore(...) кидає NotFoundError. Вставляємо перед
      // гвинтиком у його СПРАВЖНЬОГО батька; якщо гвинтика нема — у кінець.
      if (settingsBtn && settingsBtn.parentNode) {
        settingsBtn.parentNode.insertBefore(buttonEl, settingsBtn);
      } else {
        rightControls.appendChild(buttonEl);
      }
      return true;
    } catch (err) {
      try { rightControls.appendChild(buttonEl); return true; } catch (e) { return false; }
    }
  }
};

// ═══════════════════════════════════════════════════════════
// Реєстр активних адаптерів. Щоб додати сервіс (Netflix тощо) — новий
// об'єкт з тим самим інтерфейсом + відповідний matches у manifest.json.
// ═══════════════════════════════════════════════════════════
export const SITE_ADAPTERS: SiteAdapter[] = [YouTubeAdapter];
