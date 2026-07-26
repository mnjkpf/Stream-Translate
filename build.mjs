// Збірка розширення: dist/ стає готовою до "Load unpacked" копією.
//
// Джерела поки лишаються класичними скриптами без import/export (спільний
// стан живе на window.__subtr — див. src/core.js), тому esbuild тут не
// бандлить залежності, а лише транспілює/копіює кожен entry point окремо,
// зберігаючи ту саму структуру директорій і той самий порядок файлів, що й
// у manifest.json → content_scripts. ytBridge.js виконується в MAIN world
// (окремий контекст сторінки, без chrome.*) і тому лишається власним файлом,
// а не змішується зі скриптами ISOLATED-world.
//
// Коли Фаза 2 перейде на справжні ES-модулі, тут з'явиться bundle: true
// з малою кількістю вхідних точок замість списку файлів 1:1.

import { build } from 'esbuild';
import { cpSync, rmSync, mkdirSync } from 'node:fs';

const OUT_DIR = 'dist';

const JS_ENTRY_POINTS = [
  // ISOLATED-world content scripts — порядок має збігатися з manifest.json
  'src/subtitleParser.js',
  'src/youtubeCaptions.js',
  'src/siteAdapters.js',
  'src/core.js',
  'src/i18n.js',
  'src/settingsPanel.js',
  'src/ui.js',
  'src/subtitles.js',
  'src/sync.js',
  'src/interaction.js',
  'src/translate.js',
  'src/main.js',
  // MAIN-world бандл (окремий content-script у manifest.json)
  'src/ytBridge.js',
  // Background service worker + його importScripts()-залежність
  'background.js',
  'src/cacheKey.js',
  // Popup
  'popup.js'
];

const STATIC_FILES = ['manifest.json', 'overlay.css', 'popup.html'];
const STATIC_DIRS = ['icons'];

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

await build({
  entryPoints: JS_ENTRY_POINTS,
  outdir: OUT_DIR,
  outbase: '.', // зберігає src/... як підпапку в dist/, а не сплющує в один рівень
  bundle: false,
  logLevel: 'info'
});

for (const file of STATIC_FILES) {
  cpSync(file, `${OUT_DIR}/${file}`);
}
for (const dir of STATIC_DIRS) {
  cpSync(dir, `${OUT_DIR}/${dir}`, { recursive: true });
}

console.log('[build] dist/ готовий — chrome://extensions → Load unpacked → dist/');
