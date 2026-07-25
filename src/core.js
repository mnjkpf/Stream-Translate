// HDRezka Subtitle Translator — спільний namespace для content-script модулів
// Класичні скрипти (без збірки, без ES-модулів) не мають гарантованої спільної
// лексичної області між файлами, тож увесь спільний стан і утиліти живуть
// на window.__hdrezkaTr (TR), а не в замиканні окремого файлу.

(() => {
  'use strict';

  // Запобігаємо подвійній ін'єкції самого namespace (SPA-переінжект тощо).
  // Модулі, що йдуть після (ui.js, subtitles.js, ...), не перевіряють booted —
  // вони лише перевизначають функції на TR, що безпечно повторити. Побічні
  // ефекти (виклик init()) стримує сам main.js окремою перевіркою TR.booted.
  if (window.__hdrezkaTr && window.__hdrezkaTr.booted) return;

  const TR = (window.__hdrezkaTr = window.__hdrezkaTr || {});

  // ═══════════════════════════════════════════════════════════
  // АДАПТЕР САЙТУ (siteAdapters.js) — уся платформо-специфічна логіка
  // ═══════════════════════════════════════════════════════════
  TR.adapter = (window.__hdrezkaTrAdapters || []).find(a => a.matchesHost(location.host));

  // ═══════════════════════════════════════════════════════════
  // СТАН
  // ═══════════════════════════════════════════════════════════
  TR.state = {
    video: null,           // <video> елемент
    cues: [],              // [{start, end, text}]
    currentCue: null,      // активний субтитр
    offset: 0,             // зсув у секундах
    container: null,       // div з субтитрами
    tooltip: null,         // tooltip
    loadBtn: null,         // кнопка завантаження
    offsetIndicator: null, // індикатор зсуву
    toast: null,           // L-8: сповіщення замість alert()
    selecting: false,      // чи зараз виділяється фраза
    selStart: null,
    selEnd: null,
    fileInput: null,
    pausedByTooltip: false // чи поставили на паузу через tooltip
  };

  // ═══════════════════════════════════════════════════════════
  // ДРІБНІ УТИЛІТИ
  // ═══════════════════════════════════════════════════════════
  TR.escapeHtml = function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;'); // L-1: неекранована лапка — латентний XSS, якщо колись потрапить у single-quoted атрибут
  };
})();
