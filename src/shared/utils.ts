// Subtitle Translator — дрібні утиліти

export function escapeHtml(s: unknown): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;'); // L-1: неекранована лапка — латентний XSS, якщо колись потрапить у single-quoted атрибут
}
