// Subtitle Translator — переклад слова/фрази і tooltip

import { state } from '../state';
import { MESSAGES } from '../../shared/i18n';
import { escapeHtml } from '../../shared/utils';
import { MSG, STORAGE } from '../../shared/messages';
import { speak, isSpeechSupported } from './studyControls';
// Циклічний імпорт з interaction.ts (див. коментар там) — безпечно з тих
// самих причин: обидва боки використовують імпорт лише всередині функцій.
import { clearSelection } from './interaction';

export type TranslateMode = 'word' | 'phrase' | 'sentence';

interface TranslatePosition {
  x: number;
  y: number;
}

interface TranslateResponse {
  translation?: string;
  error?: string;
}

let translateRequestId = 0; // L-5: щоб застаріла відповідь не перезаписала свіжішу

// L-7: tooltip позиціонується по {x,y}, а не по MouseEvent напряму —
// так його можна показати і від клавіатурної активації слова (Enter/Space),
// де немає події миші, а є лише сам елемент.
export function positionFromEvent(e: MouseEvent): TranslatePosition {
  return { x: e.clientX, y: e.clientY };
}

export function positionFromElement(el: Element): TranslatePosition {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.bottom };
}

export async function translateAndShow(
  text: string,
  mode: TranslateMode,
  pos: TranslatePosition,
  anchorEl?: HTMLElement
): Promise<void> {
  // Очищаємо текст від пунктуації по краях
  text = text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').trim();
  if (!text) return;

  const requestId = ++translateRequestId;

  // Пауза відео
  if (state.video && !state.video.paused) {
    state.video.pause();
    state.pausedByTooltip = true;
  }

  showTooltip(pos, `<div class="subtr-tt-loading">${escapeHtml(MESSAGES.translating)}</div>`);

  const context = state.currentCue ? state.currentCue.text.replace(/\n/g, ' ') : text;

  try {
    const resp: TranslateResponse = await chrome.runtime.sendMessage({
      type: MSG.translate,
      text,
      context,
      mode,
      sourceUrl: location.href // для історії — щоб можна було повернутись до відео
    });

    // L-5: поки чекали на відповідь, міг початися новіший запит (швидкий
    // клік по іншому слову) — його tooltip не можна перезаписати нашим
    if (requestId !== translateRequestId) return;

    if (resp.error) {
      showTooltip(pos, `<div class="subtr-tt-error">${escapeHtml(resp.error)}</div>`);
      return;
    }

    if (mode === 'word') {
      renderWordTooltip(text, resp.translation || '', context, pos);
    } else if (mode === 'sentence') {
      renderLineTooltip(MESSAGES.sentenceLabel, text, resp.translation || '', pos);
    } else {
      renderLineTooltip(MESSAGES.phraseLabel, text, resp.translation || '', pos);
    }
  } catch (err) {
    if (requestId !== translateRequestId) return;
    showTooltip(pos, `<div class="subtr-tt-error">${escapeHtml((err as Error).message)}</div>`);
  }
}

function renderWordTooltip(word: string, raw: string, context: string, anchorPos: TranslatePosition): void {
  // Парсимо відповідь: LEMMA / POS / TRANSLATION / EXAMPLE
  const fields: Record<string, string> = {};
  raw.split('\n').forEach(line => {
    const m = line.match(/^(LEMMA|POS|TRANSLATION|EXAMPLE):\s*(.+)$/i);
    if (m) fields[m[1].toUpperCase()] = m[2].trim();
  });

  const lemma = fields.LEMMA || word;
  const pos = fields.POS || '';
  const translation = fields.TRANSLATION || raw;
  const example = fields.EXAMPLE || '';

  const html = `
    <div class="subtr-tt-word">${escapeHtml(lemma)}</div>
    ${pos ? `<div class="subtr-tt-meta">${escapeHtml(pos)}</div>` : ''}
    <div class="subtr-tt-translation">${escapeHtml(translation)}</div>
    ${example ? `<div class="subtr-tt-example">${escapeHtml(example)}</div>` : ''}
    <div class="subtr-tt-actions">
      ${isSpeechSupported()
        ? `<button class="subtr-tt-btn" data-action="speak" title="${escapeHtml(MESSAGES.speakWordTitle)}"`
          + ` aria-label="${escapeHtml(MESSAGES.speakWordTitle)}">${escapeHtml(MESSAGES.speakWord)}</button>`
        : ''}
      <button class="subtr-tt-btn" data-action="save">${escapeHtml(MESSAGES.saveWord)}</button>
      <button class="subtr-tt-btn" data-action="close">${escapeHtml(MESSAGES.close)}</button>
    </div>
  `;
  showTooltip(anchorPos, html);

  // Вимова — рідним синтезом браузера: без мережі, без ключа, без квоти.
  // Читаємо лему (базову форму), а не форму зі субтитрів.
  state.tooltip!.querySelector('[data-action="speak"]')?.addEventListener('click', async () => {
    const settings = await chrome.storage.local.get(STORAGE.sourceLang);
    speak(lemma, settings[STORAGE.sourceLang] || 'English');
  });

  // Обробка кнопок
  // Раніше цей обробник не чекав на відповідь і завжди малював «✓ Збережено» —
  // будь-який збій (401, валідація, бекенд лежить) виглядав як успіх, і слово
  // мовчки зникало. Тепер чекаємо результат і показуємо реальний стан.
  state.tooltip!.querySelector('[data-action="save"]')?.addEventListener('click', async () => {
    const btn = state.tooltip!.querySelector('[data-action="save"]') as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.textContent = MESSAGES.saveWordSaving; }

    try {
      const resp = await chrome.runtime.sendMessage({
        type: MSG.saveWord,
        word: lemma,
        translation,
        context,
        pos,      // для бекенду (POST /words) — на локальний wordbook не впливає
        example,
        // Посилання на відео: картка повторення зможе відправити назад
        // до моменту, де слово зустрілось.
        sourceUrl: location.href
      });

      // Кнопка живе в tooltip, який міг уже змінитись під наступний переклад.
      const current = state.tooltip!.querySelector('[data-action="save"]') as HTMLButtonElement | null;
      if (!current) return;

      if (resp?.error) {
        current.textContent = MESSAGES.saveWordFailed;
        current.title = resp.error;
        current.disabled = false;
        return;
      }
      current.textContent = MESSAGES.saveWordDone;
    } catch (err) {
      const current = state.tooltip!.querySelector('[data-action="save"]') as HTMLButtonElement | null;
      if (!current) return;
      current.textContent = MESSAGES.saveWordFailed;
      current.title = (err as Error).message;
      current.disabled = false;
    }
  });
  state.tooltip!.querySelector('[data-action="close"]')?.addEventListener('click', hideTooltip);
}

// Спільний рендер для phrase/sentence — відрізняються лише міткою (label)
// над текстом; обидва без кнопки "Зберегти" (це лише для word-режиму).
function renderLineTooltip(label: string, text: string, translation: string, anchorPos: TranslatePosition): void {
  const html = `
    <div class="subtr-tt-meta">${escapeHtml(label)}</div>
    <div class="subtr-tt-word" style="font-size:13px; font-weight:400;">${escapeHtml(text)}</div>
    <div class="subtr-tt-translation" style="margin-top:8px;">${escapeHtml(translation)}</div>
    <div class="subtr-tt-actions">
      <button class="subtr-tt-btn" data-action="close">${escapeHtml(MESSAGES.close)}</button>
    </div>
  `;
  showTooltip(anchorPos, html);
  state.tooltip!.querySelector('[data-action="close"]')?.addEventListener('click', hideTooltip);
}

function showTooltip(anchorPos: TranslatePosition, html: string): void {
  const tooltip = state.tooltip!;
  tooltip.innerHTML = html;
  tooltip.classList.add('visible');

  // Позиціонування біля курсора/елемента, але в межах вікна
  const x = anchorPos.x;
  const y = anchorPos.y;
  const ttRect = tooltip.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = x + 12;
  let top = y + 12;

  if (left + ttRect.width > vw - 10) left = x - ttRect.width - 12;
  if (top + ttRect.height > vh - 10) top = y - ttRect.height - 12;
  if (left < 10) left = 10;
  if (top < 10) top = 10;

  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
}

export function hideTooltip(): void {
  state.tooltip!.classList.remove('visible');
  clearSelection();

  // Якщо ми ставили на паузу — відновити. L-3: прапорець скидаємо
  // безумовно — інакше якщо користувач сам відновив відтворення, поки
  // tooltip був відкритий, pausedByTooltip лишався б true назавжди.
  if (state.pausedByTooltip) {
    if (state.video && state.video.paused) {
      state.video.play().catch(() => {});
    }
    state.pausedByTooltip = false;
  }
}
