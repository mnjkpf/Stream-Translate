// Subtitle Translator — пошук відео, завантаження і прив'язка субтитрів
// Ручне завантаження SRT/VTT (readFileSmart) і авто-завантаження з адаптера
// (loadCuesFromSource, C: YouTube тощо) — обидва шляхи ведуть до attachToVideo.

(() => {
  'use strict';

  const TR = window.__subtr;
  if (!TR || !TR.adapter) return; // сайт не підтримується — модуль мовчить

  const { adapter, state, MESSAGES } = TR;

  // ═══════════════════════════════════════════════════════════
  // ПОШУК <video> (делегується активному адаптеру сайту)
  // ═══════════════════════════════════════════════════════════
  const WAIT_FOR_VIDEO_TIMEOUT_MS = 30000; // L-11: не чекати вічно на сторінці без плеєра

  TR.waitForVideo = function waitForVideo() {
    return new Promise((resolve, reject) => {
      const v = adapter.findVideo();
      if (v) return resolve(v);

      const obs = new MutationObserver(() => {
        const v = adapter.findVideo();
        if (v) {
          cleanup();
          resolve(v);
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(MESSAGES.videoNotFound));
      }, WAIT_FOR_VIDEO_TIMEOUT_MS);

      function cleanup() {
        obs.disconnect();
        clearTimeout(timer);
      }
    });
  };

  // ═══════════════════════════════════════════════════════════
  // ЗАВАНТАЖЕННЯ ФАЙЛУ (підтримка UTF-8 і Windows-1251)
  // ═══════════════════════════════════════════════════════════
  const MAX_SUBTITLE_FILE_SIZE = 5 * 1024 * 1024; // L-13: захист від випадково обраного величезного файлу

  TR.readFileSmart = function readFileSmart(file) {
    return new Promise((resolve, reject) => {
      if (file.size > MAX_SUBTITLE_FILE_SIZE) {
        reject(new Error(MESSAGES.fileTooLarge((file.size / 1024 / 1024).toFixed(1))));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const buffer = reader.result;
        // Спроба UTF-8
        let text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
        // Якщо багато заміняючих символів — пробуємо CP1251
        const replacementCount = (text.match(/�/g) || []).length;
        if (replacementCount > text.length * 0.01) {
          text = new TextDecoder('windows-1251').decode(buffer);
        }
        resolve(text);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  };

  // ═══════════════════════════════════════════════════════════
  // ПРИВ'ЯЗКА ДО ВІДЕО
  // ═══════════════════════════════════════════════════════════
  TR.attachToVideo = function attachToVideo() {
    if (!state.video || !state.container) return;

    // Знаходимо контейнер плеєра (через адаптер сайту) і кладемо туди субтитри
    const playerContainer = adapter.getMountPoint(state.video);
    if (playerContainer && !playerContainer.contains(state.container)) {
      // Гарантуємо що батько має position
      const cs = getComputedStyle(playerContainer);
      if (cs.position === 'static') {
        playerContainer.style.position = 'relative';
      }
      playerContainer.appendChild(state.container);
    }
    state.container.style.display = 'block';
  };

  // Рівень 3 (§1.2.C): зупинка DOM-скрейпінгу з попереднього відео/спроби —
  // інакше MutationObserver з минулого ролика продовжував би писати в
  // overlay поверх нового стану.
  let domFallbackStop = null;
  function stopDomFallback() {
    if (domFallbackStop) {
      domFallbackStop();
      domFallbackStop = null;
    }
  }

  // H-2: при переприв'язці до нового <video> (нова серія, перерендер плеєра)
  // старі cues/offset/currentCue і напис на кнопці не мають лишатись —
  // інакше субтитри попередньої серії накладаються на нову.
  TR.resetSubtitleState = function resetSubtitleState() {
    stopDomFallback();
    state.cues = [];
    state.currentCue = null;
    state.offset = 0;
    if (state.container) state.container.innerHTML = '';
    if (state.loadBtn) {
      state.loadBtn.classList.remove('has-subs');
      state.loadBtn.textContent = MESSAGES.loadButtonIdle;
    }
  };

  TR.handleVideoChanged = function handleVideoChanged(newVideo) {
    if (state.video) {
      state.video.removeEventListener('timeupdate', TR.onTimeUpdate);
    }
    state.video = newVideo;
    state.video.addEventListener('timeupdate', TR.onTimeUpdate);
    TR.resetSubtitleState();
    TR.attachToVideo();

    // Якщо адаптер сам постачає субтитри (YouTube) — це не лише зміна
    // ролика (та йде через observeNavigation), а й будь-яка заміна <video>
    // (напр. вставка рекламного відео) — теж має підтягнути cues заново
    const subtitleSource = adapter.getSubtitleSource();
    if (subtitleSource) TR.loadCuesFromSource(subtitleSource);
  };

  // ═══════════════════════════════════════════════════════════
  // АВТОЗАВАНТАЖЕННЯ СУБТИТРІВ З АДАПТЕРА (getSubtitleSource(), C, YouTube)
  // Якщо адаптер сайту не постачає субтитри сам (getSubtitleSource() === null) —
  // цей блок узагалі не викликається, лишається кнопка + ручне завантаження SRT.
  // ═══════════════════════════════════════════════════════════
  let subtitleLoadRequestId = 0; // та сама ідея, що й L-5 для перекладу

  TR.loadCuesFromSource = async function loadCuesFromSource(source) {
    const requestId = ++subtitleLoadRequestId;
    stopDomFallback();

    let result;
    try {
      result = await source.fetchCues();
    } catch (err) {
      console.error('[Subtitle Translator] fetchCues error:', err);
      // Застаріла відповідь (користувач уже перемкнув відео) — не показуємо
      // помилку/не чіпаємо cues нового відео
      if (requestId !== subtitleLoadRequestId) return;
      adapter.showNativeSubtitles?.();
      TR.showToast(MESSAGES.subtitlesLoadError);
      return;
    }

    if (requestId !== subtitleLoadRequestId) return; // гонка: прийшла застаріла відповідь

    const cues = (result && result.cues) || [];
    state.cues = cues;
    state.currentCue = null;
    if (state.container) state.container.innerHTML = '';

    if (cues.length === 0) {
      // Рівень 3 (§1.2.C, опційний хук адаптера): перш ніж здатись
      // остаточно, пробуємо DOM-скрейпінг живих нативних субтитрів.
      const started = adapter.startCaptionFallback?.((text) => {
        if (requestId !== subtitleLoadRequestId) return;
        TR.renderCueText(text);
      });

      if (started) {
        domFallbackStop = started;
        TR.attachToVideo();
        adapter.hideNativeSubtitles?.();
        return;
      }

      adapter.showNativeSubtitles?.();
      // noCaptions: треків справді немає. loadFailed: треки є, але timedtext
      // не віддав валідного тіла (§1.2.B) — розрізнення для чесного повідомлення.
      const message = result && result.state === 'loadFailed'
        ? MESSAGES.subtitlesLoadError
        : MESSAGES.subtitlesUnavailable;
      TR.showToast(message);
      return;
    }

    TR.attachToVideo();
    adapter.hideNativeSubtitles?.();

    if (result.isFallbackLanguage && result.languageCode) {
      TR.showToast(MESSAGES.subtitleFallbackLanguage(result.languageCode));
    }
  };
})();
