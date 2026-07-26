// Subtitle Translator — переклад слова/фрази і tooltip

(() => {
  'use strict';

  const TR = window.__subtr;
  if (!TR || !TR.adapter) return; // сайт не підтримується — модуль мовчить

  const { state, MESSAGES, escapeHtml } = TR;

  let translateRequestId = 0; // L-5: щоб застаріла відповідь не перезаписала свіжішу

  // L-7: tooltip позиціонується по {x,y}, а не по MouseEvent напряму —
  // так його можна показати і від клавіатурної активації слова (Enter/Space),
  // де немає події миші, а є лише сам елемент.
  TR.positionFromEvent = function positionFromEvent(e) {
    return { x: e.clientX, y: e.clientY };
  };

  TR.positionFromElement = function positionFromElement(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.bottom };
  };

  TR.translateAndShow = async function translateAndShow(text, mode, pos, anchorEl) {
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
      const resp = await chrome.runtime.sendMessage({
        type: 'translate',
        text,
        context,
        mode
      });

      // L-5: поки чекали на відповідь, міг початися новіший запит (швидкий
      // клік по іншому слову) — його tooltip не можна перезаписати нашим
      if (requestId !== translateRequestId) return;

      if (resp.error) {
        showTooltip(pos, `<div class="subtr-tt-error">${escapeHtml(resp.error)}</div>`);
        return;
      }

      if (mode === 'word') {
        renderWordTooltip(text, resp.translation, context, pos);
      } else {
        renderPhraseTooltip(text, resp.translation, pos);
      }
    } catch (err) {
      if (requestId !== translateRequestId) return;
      showTooltip(pos, `<div class="subtr-tt-error">${escapeHtml(err.message)}</div>`);
    }
  };

  function renderWordTooltip(word, raw, context, anchorPos) {
    // Парсимо відповідь: LEMMA / POS / TRANSLATION / EXAMPLE
    const fields = {};
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
        <button class="subtr-tt-btn" data-action="save">${escapeHtml(MESSAGES.saveWord)}</button>
        <button class="subtr-tt-btn" data-action="close">${escapeHtml(MESSAGES.close)}</button>
      </div>
    `;
    showTooltip(anchorPos, html);

    // Обробка кнопок
    state.tooltip.querySelector('[data-action="save"]')?.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        type: 'saveWord',
        word: lemma,
        translation,
        context
      });
      const btn = state.tooltip.querySelector('[data-action="save"]');
      if (btn) btn.textContent = MESSAGES.saveWordDone;
    });
    state.tooltip.querySelector('[data-action="close"]')?.addEventListener('click', TR.hideTooltip);
  }

  function renderPhraseTooltip(phrase, translation, anchorPos) {
    const html = `
      <div class="subtr-tt-meta">${escapeHtml(MESSAGES.phraseLabel)}</div>
      <div class="subtr-tt-word" style="font-size:13px; font-weight:400;">${escapeHtml(phrase)}</div>
      <div class="subtr-tt-translation" style="margin-top:8px;">${escapeHtml(translation)}</div>
      <div class="subtr-tt-actions">
        <button class="subtr-tt-btn" data-action="close">${escapeHtml(MESSAGES.close)}</button>
      </div>
    `;
    showTooltip(anchorPos, html);
    state.tooltip.querySelector('[data-action="close"]')?.addEventListener('click', TR.hideTooltip);
  }

  function showTooltip(anchorPos, html) {
    state.tooltip.innerHTML = html;
    state.tooltip.classList.add('visible');

    // Позиціонування біля курсора/елемента, але в межах вікна
    const x = anchorPos.x;
    const y = anchorPos.y;
    const ttRect = state.tooltip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = x + 12;
    let top = y + 12;

    if (left + ttRect.width > vw - 10) left = x - ttRect.width - 12;
    if (top + ttRect.height > vh - 10) top = y - ttRect.height - 12;
    if (left < 10) left = 10;
    if (top < 10) top = 10;

    state.tooltip.style.left = left + 'px';
    state.tooltip.style.top = top + 'px';
  }

  TR.hideTooltip = function hideTooltip() {
    state.tooltip.classList.remove('visible');
    TR.clearSelection();

    // Якщо ми ставили на паузу — відновити. L-3: прапорець скидаємо
    // безумовно — інакше якщо користувач сам відновив відтворення, поки
    // tooltip був відкритий, pausedByTooltip лишався б true назавжди.
    if (state.pausedByTooltip) {
      if (state.video && state.video.paused) {
        state.video.play().catch(() => {});
      }
      state.pausedByTooltip = false;
    }
  };
})();
