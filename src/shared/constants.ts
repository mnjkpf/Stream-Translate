// Subtitle Translator — константи, спільні для background і UI (popup +
// in-page панель налаштувань). Кожен бандл (background.js, popup.js,
// content.js) імпортує це окремо — esbuild інлайнить у кожен свій бандл.

import { t } from './i18n';

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

// Списки віддаються функціями, а не константами: hint локалізований, а мову
// користувач змінює на льоту. Константа зафіксувала б мову на момент завантаження
// бандла, і після перемикання підказки лишились би старими до перезавантаження.
// label не перекладається свідомо — назва мови подана самою цією мовою
// (English, Polski), і це не залежить від мови інтерфейсу.

// Стабільні текстові моделі Gemini, придатні для перекладу субтитрів.
// Свідомо БЕЗ покоління 2.5 (gemini-2.5-flash тощо): Google вимикає його
// 16 жовтня 2026, тож зашитий у налаштування 2.5 просто перестав би працювати.
// Preview-моделі теж не беремо — вони зникають із попередженням у 2 тижні.
export function geminiModels(): SelectOption[] {
  return [
    {
      value: 'gemini-3.5-flash-lite',
      label: 'Gemini 3.5 Flash-Lite',
      hint: t('modelHintFastest')
    },
    {
      value: 'gemini-3.6-flash',
      label: 'Gemini 3.6 Flash',
      hint: t('modelHintBalanced')
    },
    {
      value: 'gemini-3.5-flash',
      label: 'Gemini 3.5 Flash',
      hint: t('modelHintAccurate')
    },
    {
      value: 'gemini-3.1-flash-lite',
      label: 'Gemini 3.1 Flash-Lite',
      hint: t('modelHintLegacy')
    }
  ];
}

// Переклад слова/фрази — коротка задача з високою частотою викликів, тому
// за замовчуванням беремо найшвидшу модель, а не найрозумнішу.
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

// Мови субтитрів: ті самі списки в popup і в панелі на сторінці.
export function sourceLanguages(): SelectOption[] {
  return [
    { value: 'English', label: 'English', hint: t('langEnglish') },
    { value: 'Spanish', label: 'Español', hint: t('langSpanish') },
    { value: 'French', label: 'Français', hint: t('langFrench') },
    { value: 'German', label: 'Deutsch', hint: t('langGerman') },
    { value: 'Polish', label: 'Polski', hint: t('langPolish') },
    { value: 'Italian', label: 'Italiano', hint: t('langItalian') }
  ];
}

export function targetLanguages(): SelectOption[] {
  return [
    { value: 'Ukrainian', label: 'Українська', hint: t('langUkrainian') },
    { value: 'English', label: 'English', hint: t('langEnglish') },
    { value: 'Polish', label: 'Polski', hint: t('langPolish') },
    { value: 'German', label: 'Deutsch', hint: t('langGerman') }
  ];
}
