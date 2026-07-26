// Subtitle Translator — синхронізація субтитрів з відео (timeupdate)

(() => {
  'use strict';

  const TR = window.__subtr;
  if (!TR || !TR.adapter) return; // сайт не підтримується — модуль мовчить

  const { state } = TR;

  TR.onTimeUpdate = function onTimeUpdate() {
    if (state.cues.length === 0) return;

    const t = state.video.currentTime - state.offset;
    const cue = findCueAt(t);

    if (cue !== state.currentCue) {
      state.currentCue = cue;
      renderCue(cue);
    }
  };

  function findCueAt(t) {
    // Простий лінійний пошук — для типового фільму (~2000 cues) це швидко
    for (const cue of state.cues) {
      if (t >= cue.start && t <= cue.end) return cue;
    }
    return null;
  }

  function renderCue(cue) {
    TR.renderCueText(cue ? cue.text : null);
  }

  // Винесено з renderCue() так, щоб Рівень 3 (DOM-скрейпінг живих субтитрів
  // YouTube, siteAdapters.js) міг віддзеркалювати "живий" рядок в overlay
  // тим самим кодом розбиття на клікабельні слова, а не timeupdate-циклом.
  TR.renderCueText = function renderCueText(text) {
    if (!text) {
      state.container.innerHTML = '';
      return;
    }

    const lines = text.split('\n');
    state.container.innerHTML = '';

    lines.forEach(line => {
      const lineEl = document.createElement('span');
      lineEl.className = 'subtr-line';

      // Розбиваємо рядок на слова + пробіли/розділові
      // Регулярка ловить послідовності літер/цифр/апострофів як слова
      const tokens = line.split(/(\s+|[^\p{L}\p{N}'’-]+)/u);

      tokens.forEach(tok => {
        if (!tok) return;
        // Це слово якщо є хоча б одна літера
        if (/\p{L}/u.test(tok)) {
          const wordEl = document.createElement('span');
          wordEl.className = 'subtr-word';
          wordEl.textContent = tok;
          wordEl.dataset.word = tok;
          // L-7: доступність — слово можна дійти Tab'ом і активувати з клавіатури
          wordEl.setAttribute('role', 'button');
          wordEl.setAttribute('tabindex', '0');
          lineEl.appendChild(wordEl);
        } else {
          // Пробіл або пунктуація
          lineEl.appendChild(document.createTextNode(tok));
        }
      });

      state.container.appendChild(lineEl);
    });
  };
})();
