// Subtitle Translator — константи, спільні для background і UI (popup +
// in-page панель налаштувань). Кожен бандл (background.js, popup.js,
// content.js) імпортує це окремо — esbuild інлайнить у кожен свій бандл.

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

// Стабільні текстові моделі Gemini, придатні для перекладу субтитрів.
// Свідомо БЕЗ покоління 2.5 (gemini-2.5-flash тощо): Google вимикає його
// 16 жовтня 2026, тож зашитий у налаштування 2.5 просто перестав би працювати.
// Preview-моделі теж не беремо — вони зникають із попередженням у 2 тижні.
export const GEMINI_MODELS: SelectOption[] = [
  {
    value: 'gemini-3.5-flash-lite',
    label: 'Gemini 3.5 Flash-Lite',
    hint: 'Найшвидша й найдешевша — типовий вибір'
  },
  {
    value: 'gemini-3.6-flash',
    label: 'Gemini 3.6 Flash',
    hint: 'Баланс швидкості та якості'
  },
  {
    value: 'gemini-3.5-flash',
    label: 'Gemini 3.5 Flash',
    hint: 'Найточніша — для складних діалогів'
  },
  {
    value: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash-Lite',
    hint: 'Дешевша, попереднє покоління'
  }
];

// Переклад слова/фрази — коротка задача з високою частотою викликів, тому
// за замовчуванням беремо найшвидшу модель, а не найрозумнішу.
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

// Мови: ті самі списки в popup і в панелі на сторінці.
export const SOURCE_LANGUAGES: SelectOption[] = [
  { value: 'English', label: 'English', hint: 'Англійська' },
  { value: 'Spanish', label: 'Español', hint: 'Іспанська' },
  { value: 'French', label: 'Français', hint: 'Французька' },
  { value: 'German', label: 'Deutsch', hint: 'Німецька' },
  { value: 'Polish', label: 'Polski', hint: 'Польська' },
  { value: 'Italian', label: 'Italiano', hint: 'Італійська' }
];

export const TARGET_LANGUAGES: SelectOption[] = [
  { value: 'Ukrainian', label: 'Українська' },
  { value: 'English', label: 'English', hint: 'Англійська' },
  { value: 'Polish', label: 'Polski', hint: 'Польська' },
  { value: 'German', label: 'Deutsch', hint: 'Німецька' }
];
