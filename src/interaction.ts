// Subtitle Translator — взаємодія з субтитрами (клік / виділення фрази)

import { state } from './state';
// Циклічний імпорт з translate.ts (воно, своєю чергою, імпортує
// clearSelection звідси) — безпечно, бо обидва боки використовують імпорт
// лише всередині функцій-обробників подій, не на верхньому рівні модуля.
import { translateAndShow, positionFromEvent, positionFromElement, hideTooltip } from './translate';

// H-4: браузер завжди шле click/mouseup ПЕРЕД dblclick, тому одинарний клік
// на слово не можна перекладати одразу — інакше подвійний клік по тому
// самому слову спершу переклав би слово (двічі), а вже потім рядок.
// Відкладаємо word-переклад на DBLCLICK_DELAY_MS; якщо за цей час прийде
// другий клік (новий mousedown/mouseup) чи dblclick — відкладений переклад
// скасовується на користь нового. Фрази (протягування) цієї затримки не
// мають — dblclick на протягнутому виділенні не буває.
const DBLCLICK_DELAY_MS = 250;

export function setupInteraction(): void {
  let mouseDownWord: HTMLElement | null = null;
  let pendingWordClick: ReturnType<typeof setTimeout> | null = null;
  const container = state.container!;

  function cancelPendingWordClick(): void {
    if (pendingWordClick) {
      clearTimeout(pendingWordClick);
      pendingWordClick = null;
    }
  }

  container.addEventListener('mousedown', (e) => {
    const word = (e.target as HTMLElement).closest<HTMLElement>('.subtr-word');
    if (!word) return;
    cancelPendingWordClick();
    mouseDownWord = word;
    state.selecting = false;
    clearSelection();

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

  container.addEventListener('mousemove', (e) => {
    if (!mouseDownWord) return;
    const word = (e.target as HTMLElement).closest<HTMLElement>('.subtr-word');
    if (word && word !== mouseDownWord) {
      state.selecting = true;
      highlightRange(mouseDownWord, word);
    }
  });

  container.addEventListener('mouseup', (e) => {
    if (!mouseDownWord) return;
    const word = (e.target as HTMLElement).closest<HTMLElement>('.subtr-word');

    if (state.selecting && word) {
      // Виділена фраза
      const phrase = getSelectedText();
      if (phrase) {
        translateAndShow(phrase, 'phrase', positionFromEvent(e));
      }
    } else if (mouseDownWord) {
      // Клік на одне слово — відкладаємо (H-4), щоб dblclick міг скасувати
      const word = mouseDownWord;
      const pos = positionFromEvent(e);
      cancelPendingWordClick();
      pendingWordClick = setTimeout(() => {
        pendingWordClick = null;
        translateAndShow(word.dataset.word || '', 'word', pos, word);
      }, DBLCLICK_DELAY_MS);
    }

    mouseDownWord = null;
    state.selecting = false;
  });

  // H-4: подвійний клік по субтитру — переклад усього рядка (режим
  // 'sentence'), а не слова під курсором. Скасовує відкладений word-клік
  // від обох mouseup цього ж жесту (див. коментар вище DBLCLICK_DELAY_MS).
  container.addEventListener('dblclick', (e) => {
    cancelPendingWordClick();
    if (!state.currentCue) return;
    const sentence = state.currentCue.text.replace(/\n/g, ' ');
    translateAndShow(sentence, 'sentence', positionFromEvent(e));
  });

  // L-7: клавіатурна активація слова (Tab до слова + Enter/Space) —
  // той самий переклад, що й по кліку, але без позиції курсора миші
  container.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const word = (e.target as HTMLElement).closest<HTMLElement>('.subtr-word');
    if (!word) return;
    e.preventDefault();
    if (state.video && !state.video.paused) {
      state.video.pause();
      state.pausedByTooltip = true;
    }
    translateAndShow(word.dataset.word || '', 'word', positionFromElement(word), word);
  });

  // Закрити tooltip при кліку поза ним
  document.addEventListener('mousedown', (e) => {
    if (state.tooltip!.contains(e.target as Node)) return;
    if ((e.target as HTMLElement).closest('.subtr-word')) return;
    hideTooltip();
  });
}

function highlightRange(from: HTMLElement, to: HTMLElement): void {
  const words = [...state.container!.querySelectorAll<HTMLElement>('.subtr-word')];
  const i1 = words.indexOf(from);
  const i2 = words.indexOf(to);
  const [start, end] = i1 < i2 ? [i1, i2] : [i2, i1];

  words.forEach((w, i) => {
    w.classList.toggle('subtr-selected', i >= start && i <= end);
  });
}

function getSelectedText(): string {
  const selected = state.container!.querySelectorAll('.subtr-word.subtr-selected');
  if (selected.length === 0) return '';

  // Збираємо текст з пробілами між словами
  return [...selected].map(w => w.textContent).join(' ');
}

export function clearSelection(): void {
  state.container!.querySelectorAll('.subtr-selected').forEach(w => {
    w.classList.remove('subtr-selected');
  });
}
