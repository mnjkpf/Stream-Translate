// HDRezka Subtitle Translator — MAIN-world міст для YouTube
// Виконується в контексті сторінки (world: MAIN), тому має доступ до
// window.ytInitialPlayerResponse і #movie_player.getPlayerResponse(),
// на відміну від основного набору content-скриптів (ISOLATED world, src/*.js).
// У MAIN world немає chrome.* — уся комунікація лише через window.postMessage.

(() => {
  'use strict';

  const REQUEST_TYPE = 'hdrtr-yt-tracks-request';
  const RESPONSE_TYPE = 'hdrtr-yt-tracks-response';

  // ?v= (звичайне відео) чи /shorts/<id> з поточного URL — щоб перевірити,
  // що ytInitialPlayerResponse не застарів (§1.2.A: він лишається відповіддю
  // початкового завантаження сторінки і не оновлюється при SPA-навігації).
  function getVideoIdFromUrl() {
    const params = new URLSearchParams(location.search);
    if (params.has('v')) return params.get('v');
    const m = location.pathname.match(/\/shorts\/([^/?]+)/);
    return m ? m[1] : null;
  }

  // Дістаємо caption-треки з "живого" player response — його baseUrl вже
  // містить усі токени поточної сесії (див. CLAUDE_CODE_BRIEF_YOUTUBE.md §4.1),
  // тому не треба реконструювати запит самостійно.
  function getCaptionData() {
    try {
      const player = document.getElementById('movie_player');
      let response = null;

      if (player && typeof player.getPlayerResponse === 'function') {
        response = player.getPlayerResponse();
      }

      if (!response) {
        const initial = window.ytInitialPlayerResponse;
        const currentVideoId = getVideoIdFromUrl();
        // ytInitialPlayerResponse відповідає першому завантаженню сторінки —
        // після SPA-навігації (відкриття відео з пошуку/рекомендацій) це вже
        // дані ПОПЕРЕДНЬОГО відео. Довіряємо йому лише коли його videoId
        // збігається з поточним URL (або URL взагалі без videoId).
        if (initial && (!currentVideoId || initial?.videoDetails?.videoId === currentVideoId)) {
          response = initial;
        }
      }

      const videoId = response?.videoDetails?.videoId || null;
      const rawTracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (!Array.isArray(rawTracks)) return { videoId, tracks: [] };

      const tracks = rawTracks
        .map(t => ({
          languageCode: t.languageCode || '',
          kind: t.kind || '',
          name: (t.name && (t.name.simpleText || (t.name.runs || []).map(r => r.text).join(''))) || '',
          baseUrl: t.baseUrl || ''
        }))
        .filter(t => t.baseUrl);

      return { videoId, tracks };
    } catch (err) {
      // Структура player response недокументована й може змінитись без
      // попередження — ISOLATED-сторона трактує порожній масив як
      // "субтитрів немає" і сама вирішує, чи пробувати резервний шлях.
      return { videoId: null, tracks: [] };
    }
  }

  window.addEventListener('message', (event) => {
    // Захист: приймаємо лише повідомлення від того самого вікна (не з
    // сторонніх фреймів) з нашим власним типом повідомлення
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== 'hdrtr-isolated' || data.type !== REQUEST_TYPE) return;

    const { videoId, tracks } = getCaptionData();

    window.postMessage({
      source: 'hdrtr-main',
      type: RESPONSE_TYPE,
      requestId: data.requestId,
      videoId,
      tracks
    }, location.origin);
  });
})();
