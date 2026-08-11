// Збірка розширення: dist/ стає готовою до "Load unpacked" копією.
//
// Структура джерел (див. docs/ARCHITECTURE.md):
//   src/background/ — service worker: мережа, токени, Gemini, кеш
//   src/popup/      — UI вкладок (профіль / слова / налаштування)
//   src/content/    — те, що працює на сторінці (adapters / subtitles / overlay)
//   src/api/        — клієнт нашого бекенду + тонка обгортка для UI
//   src/shared/     — спільне для всіх бандлів (константи, i18n, утиліти)
//
// Кожна точка входу бандлиться окремо — контексти Chrome ізольовані один від
// одного й не можуть ділити рантайм:
//   src/content/index.ts             → dist/content.js   (ISOLATED world)
//   src/content/adapters/ytBridge.js → dist/ytBridge.js  (MAIN world, окремо)
//   src/background/index.js          → dist/background.js (service worker)
//   src/popup/index.js               → dist/popup.js
//
// dist/ лишається ПЛАСКИМ: manifest.json посилається на імена файлів у корені
// dist, тому переїзд джерел по папках його не зачіпає. Репозиторій напряму як
// unpacked-розширення не вантажиться — спочатку `npm run build`, потім dist/.
//
// Окремо збирається dist/test/ — CJS-версії чистих модулів для tests/run.js,
// який лишається звичайним Node-скриптом без рантайм-залежностей.

import { build } from 'esbuild';
import { cpSync, rmSync, mkdirSync } from 'node:fs';

const OUT_DIR = 'dist';

// [шлях у джерелах, ім'я у dist/] — джерела лежать по папках, dist плаский.
const STATIC_FILES = [
  ['manifest.json', 'manifest.json'],
  ['assets/overlay.css', 'overlay.css'],
  ['src/popup/popup.html', 'popup.html'],
  ['src/dashboard/dashboard.html', 'dashboard.html']
];
const STATIC_DIRS = [['assets/icons', 'icons']];

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

// Розширення (те, що реально вантажиться в Chrome)
await build({
  entryPoints: [
    { in: 'src/content/index.ts', out: 'content' },
    { in: 'src/content/adapters/ytBridge.js', out: 'ytBridge' },
    { in: 'src/background/index.js', out: 'background' },
    { in: 'src/popup/index.js', out: 'popup' },
    { in: 'src/dashboard/index.js', out: 'dashboard' }
  ],
  outdir: OUT_DIR,
  bundle: true,
  target: 'chrome110',
  logLevel: 'info'
});

// Тестові CJS-бандли чистих модулів — окремо від розширення, для tests/run.js.
// Явний {in,out} обов'язковий: джерела лежать у різних теках, і без нього
// esbuild відтворив би структуру папок від спільного предка
// (dist/test/content/subtitles/...), а tests/run.js чекає файли плоско.
await build({
  entryPoints: [
    { in: 'src/content/subtitles/subtitleParser.ts', out: 'subtitleParser' },
    { in: 'src/content/subtitles/youtubeCaptions.ts', out: 'youtubeCaptions' },
    { in: 'src/shared/cacheKey.ts', out: 'cacheKey' },
    { in: 'src/shared/pronunciationMatch.ts', out: 'pronunciationMatch' }
  ],
  outdir: `${OUT_DIR}/test`,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'info'
});

for (const [from, to] of STATIC_FILES) {
  cpSync(from, `${OUT_DIR}/${to}`);
}
for (const [from, to] of STATIC_DIRS) {
  cpSync(from, `${OUT_DIR}/${to}`, { recursive: true });
}

console.log('[build] dist/ готовий — chrome://extensions → Load unpacked → dist/');
