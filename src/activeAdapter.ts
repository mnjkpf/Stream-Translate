// Subtitle Translator — вибір активного адаптера для поточного хоста
// Обчислюється один раз при завантаженні бандла (раніше — TR.adapter,
// core.js). main.ts перевіряє це ПЕРШИМ, до будь-яких побічних ефектів
// (див. коментар нижче); решта модулів імпортують adapter, уже знаючи, що
// сайт підтримується.

import { SITE_ADAPTERS } from './siteAdapters';
import type { SiteAdapter } from './siteAdapter';

const matched = SITE_ADAPTERS.find(a => a.matchesHost(location.host));

// Сьогодні manifest.json обмежує ін'єкцію лише youtube.com, тож matched
// не може бути undefined на практиці — але SITE_ADAPTERS.find() лишається
// типізованим чесно, тому проводимо явну перевірку тут (H-3), а не
// розкидаємо not-null assertion по кожному модулю, що читає adapter.
// main.ts не викликає жодної логіки нижче, якщо ця перевірка не пройшла.
if (!matched) {
  console.warn('[Subtitle Translator] жоден адаптер не збігається з поточним хостом:', location.host);
}

export const adapter = matched as SiteAdapter;
export const isSiteSupported = Boolean(matched);
