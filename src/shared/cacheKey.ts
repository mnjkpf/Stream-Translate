// Subtitle Translator — побудова ключа кешу перекладів

// Некриптографічний хеш (FNV-1a) — достатньо для ключа кешу, не для безпеки
export function hashString(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// H-1: ключ без mode призводив до колізій між word- і phrase-перекладом
// одного тексту, а без context — те саме слово з різних речень поверталo
// перший-ліпший закешований сенс. Обидва тепер входять у ключ.
export function buildCacheKey(
  prefix: string,
  mode: string,
  sourceLang: string,
  targetLang: string,
  text: string,
  context: string | null | undefined
): string {
  const normalizedText = text.toLowerCase().trim();
  const contextHash = hashString((context || '').toLowerCase().trim());
  return `${prefix}${mode}:${sourceLang}:${targetLang}:${contextHash}:${normalizedText}`;
}
