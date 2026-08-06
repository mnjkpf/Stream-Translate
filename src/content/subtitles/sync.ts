// Subtitle Translator — синхронізація субтитрів з відео (timeupdate)

import { state } from '../state';
import type { Cue } from './subtitleParser';
import { isKnownWord } from '../overlay/knownWords';
import { onCueChangedForAutoPause } from '../overlay/studyControls';

export function onTimeUpdate(): void {
  if (state.cues.length === 0) return;

  const t = state.video!.currentTime - state.offset;
  const cue = findCueAt(t);

  if (cue !== state.currentCue) {
    state.currentCue = cue;
    renderCue(cue);
    onCueChangedForAutoPause(cue); // режим автопаузи, якщо увімкнений клавішею 'a'
  }
}

function findCueAt(t: number): Cue | null {
  // Простий лінійний пошук — для типового фільму (~2000 cues) це швидко
  for (const cue of state.cues) {
    if (t >= cue.start && t <= cue.end) return cue;
  }
  return null;
}

function renderCue(cue: Cue | null): void {
  renderCueText(cue ? cue.text : null);
}

// Винесено з renderCue() так, щоб Рівень 3 (DOM-скрейпінг живих субтитрів
// YouTube, siteAdapters.ts) міг віддзеркалювати "живий" рядок в overlay
// тим самим кодом розбиття на клікабельні слова, а не timeupdate-циклом.
export function renderCueText(text: string | null): void {
  const container = state.container!;

  if (!text) {
    container.innerHTML = '';
    return;
  }

  const lines = text.split('\n');
  container.innerHTML = '';

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
        // Уже збережені слова підсвічуються — видно, що вже вчив, прямо
        // під час перегляду. Дані вже є локально, додаткових запитів немає.
        wordEl.className = isKnownWord(tok) ? 'subtr-word subtr-word-known' : 'subtr-word';
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

    container.appendChild(lineEl);
  });
}
