// HDRezka Subtitle Translator — взаємодія з субтитрами (клік / виділення фрази)

(() => {
  'use strict';

  const TR = window.__hdrezkaTr;
  if (!TR || !TR.adapter) return; // сайт не підтримується — модуль мовчить

  const { state } = TR;

  TR.setupInteraction = function setupInteraction() {
    let mouseDownWord = null;

    state.container.addEventListener('mousedown', (e) => {
      const word = e.target.closest('.hdr-word');
      if (!word) return;
      mouseDownWord = word;
      state.selecting = false;
      TR.clearSelection();

      // L-4: пауза одразу на mousedown, а не лише в translateAndShow —
      // якщо відео продовжує грати під час виділення фрази, зміна cue
      // перемальовує слова, і highlightRange() губить індекси (words.indexOf
      // повертає -1 для вже неіснуючих вузлів). mouseup завжди призводить
      // до translateAndShow(), яка сама відновить відтворення через hideTooltip.
      if (state.video && !state.video.paused) {
        state.video.pause();
        state.pausedByTooltip = true;
      }
    });

    state.container.addEventListener('mousemove', (e) => {
      if (!mouseDownWord) return;
      const word = e.target.closest('.hdr-word');
      if (word && word !== mouseDownWord) {
        state.selecting = true;
        highlightRange(mouseDownWord, word);
      }
    });

    state.container.addEventListener('mouseup', (e) => {
      if (!mouseDownWord) return;
      const word = e.target.closest('.hdr-word');

      if (state.selecting && word) {
        // Виділена фраза
        const phrase = getSelectedText();
        if (phrase) {
          TR.translateAndShow(phrase, 'phrase', TR.positionFromEvent(e));
        }
      } else if (mouseDownWord) {
        // Клік на одне слово
        TR.translateAndShow(mouseDownWord.dataset.word, 'word', TR.positionFromEvent(e), mouseDownWord);
      }

      mouseDownWord = null;
      state.selecting = false;
    });

    // L-7: клавіатурна активація слова (Tab до слова + Enter/Space) —
    // той самий переклад, що й по кліку, але без позиції курсора миші
    state.container.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const word = e.target.closest('.hdr-word');
      if (!word) return;
      e.preventDefault();
      if (state.video && !state.video.paused) {
        state.video.pause();
        state.pausedByTooltip = true;
      }
      TR.translateAndShow(word.dataset.word, 'word', TR.positionFromElement(word), word);
    });

    // Закрити tooltip при кліку поза ним
    document.addEventListener('mousedown', (e) => {
      if (state.tooltip.contains(e.target)) return;
      if (e.target.closest('.hdr-word')) return;
      TR.hideTooltip();
    });
  };

  function highlightRange(from, to) {
    const words = [...state.container.querySelectorAll('.hdr-word')];
    const i1 = words.indexOf(from);
    const i2 = words.indexOf(to);
    const [start, end] = i1 < i2 ? [i1, i2] : [i2, i1];

    words.forEach((w, i) => {
      w.classList.toggle('hdr-selected', i >= start && i <= end);
    });
  }

  function getSelectedText() {
    const selected = state.container.querySelectorAll('.hdr-word.hdr-selected');
    if (selected.length === 0) return '';

    // Збираємо текст з пробілами між словами
    return [...selected].map(w => w.textContent).join(' ');
  }

  TR.clearSelection = function clearSelection() {
    state.container.querySelectorAll('.hdr-selected').forEach(w => {
      w.classList.remove('hdr-selected');
    });
  };
})();
