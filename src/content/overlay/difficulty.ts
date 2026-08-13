// Індикатор складності відео: який відсоток слів у субтитрах ти вже знаєш.
//
// Сенс — допомогти вибрати матеріал за рівнем, а не навмання. Для навчання
// найкорисніший діапазон — коли знайомі приблизно 90-95% слів: достатньо
// зрозуміло, щоб стежити за сюжетом, і достатньо нового, щоб учитись.
//
// Рахується ПОВНІСТЮ на клієнті: репліки вже розпарсені в state.cues, словник
// уже лежить у пам'яті (knownWords). Жодного запиту, жодного бекенду.

import { state } from '../state';
import { MESSAGES } from '../../shared/i18n';
import { normalize, isKnownWord, onKnownWordsChanged } from './knownWords';

// Скільки унікальних слів має бути в субтитрах, щоб оцінка взагалі щось
// значила. На двох репліках відсоток скакав би від 0 до 100 і лише вводив в оману.
const MIN_UNIQUE_WORDS = 40;

const BADGE_ID = 'subtr-difficulty';
const VISIBLE_MS = 7000;

let badge: HTMLElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | undefined;

export interface Difficulty {
  known: number;
  total: number;
  percent: number;
}

// Унікальні словоформи з усіх реплік. Саме унікальні, а не всі входження:
// інакше службові the/a/is (десятки повторів) розігнали б відсоток до 90+
// на будь-якому відео й індикатор нічого не розрізняв би.
export function computeDifficulty(): Difficulty | null {
  const unique = new Set<string>();

  for (const cue of state.cues) {
    for (const raw of cue.text.split(/[\s\p{P}]+/u)) {
      const word = normalize(raw);
      // Однолітерні відкидаємо: 'I'/'a' — це не словниковий запас.
      if (word.length > 1 && /\p{L}/u.test(word)) unique.add(word);
    }
  }

  if (unique.size < MIN_UNIQUE_WORDS) return null;

  let known = 0;
  unique.forEach((word) => {
    if (isKnownWord(word)) known += 1;
  });

  return {
    known,
    total: unique.size,
    percent: Math.round((known / unique.size) * 100)
  };
}

function ensureBadge(): HTMLElement {
  if (badge && badge.isConnected) return badge;

  badge = document.createElement('div');
  badge.id = BADGE_ID;
  badge.setAttribute('role', 'status');
  // Клік ховає: індикатор корисний на старті й заважає далі.
  badge.addEventListener('click', hideBadge);
  document.body.appendChild(badge);
  return badge;
}

function hideBadge(): void {
  badge?.classList.remove('visible');
}

// Порада залежить від відсотка. Межі — з практики екстенсивного читання
// й аудіювання: нижче ~80% матеріал радше виснажує, ніж навчає.
function verdict(percent: number): { text: string; tone: string } {
  if (percent >= 96) return { text: MESSAGES.difficultyEasy, tone: 'easy' };
  if (percent >= 85) return { text: MESSAGES.difficultyGood, tone: 'good' };
  if (percent >= 70) return { text: MESSAGES.difficultyHard, tone: 'hard' };
  return { text: MESSAGES.difficultyVeryHard, tone: 'very-hard' };
}

export function showDifficulty(): void {
  const result = computeDifficulty();
  if (!result) return; // субтитрів замало для чесної оцінки

  // Розлогінений користувач має порожній словник — 0% виглядало б як вирок
  // складності, хоча насправді це просто відсутність даних.
  if (result.known === 0) return;

  const { text, tone } = verdict(result.percent);
  const el = ensureBadge();

  el.className = `visible tone-${tone}`;
  el.textContent = '';

  const value = document.createElement('div');
  value.className = 'subtr-diff-value';
  value.textContent = `${result.percent}%`;

  const label = document.createElement('div');
  label.className = 'subtr-diff-label';
  label.textContent = text;

  const detail = document.createElement('div');
  detail.className = 'subtr-diff-detail';
  detail.textContent = MESSAGES.difficultyDetail(result.known, result.total);

  el.append(value, label, detail);

  clearTimeout(hideTimer);
  hideTimer = setTimeout(hideBadge, VISIBLE_MS);
}

export function initDifficulty(): void {
  // Словник довантажується асинхронно вже після появи реплік — без цієї
  // підписки перший показ майже завжди був би на порожньому словнику.
  onKnownWordsChanged(() => {
    if (state.cues.length > 0) showDifficulty();
  });
}
