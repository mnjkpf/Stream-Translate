// Збірка розширення: dist/ стає готовою до "Load unpacked" копією.
//
// З Фази 2 джерела content-script модулів — справжні ES-модулі (import/
// export, window.__subtr більше немає), тому esbuild тепер РЕАЛЬНО бандлить
// (bundle: true) — резолвить граф залежностей і схлопує його в самодостатні
// файли:
//   - src/main.ts   → dist/content.js   (усі ISOLATED-world модулі разом)
//   - src/ytBridge.js → dist/ytBridge.js (MAIN-world, окремо — інший контекст)
//   - background.js → dist/background.js (інлайнить cacheKey.ts)
//   - popup.js      → dist/popup.js
//
// Через це репозиторій більше НЕ вантажиться напряму як unpacked-розширення
// (manifest.json → content.js існує лише в dist/) — спочатку `npm run build`.
//
// Окремо збирається dist/test/ — CJS-версії чистих модулів (subtitleParser,
// cacheKey, youtubeCaptions) для tests/run.js, який лишається звичайним
// Node-скриптом без rунтайм-залежностей (без tsx тощо).

import { build } from 'esbuild';
import { cpSync, rmSync, mkdirSync } from 'node:fs';

const OUT_DIR = 'dist';

const STATIC_FILES = ['manifest.json', 'overlay.css', 'popup.html'];
const STATIC_DIRS = ['icons'];

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

// Розширення (те, що реально вантажиться в Chrome)
await build({
  entryPoints: [
    { in: 'src/main.ts', out: 'content' },
    { in: 'src/ytBridge.js', out: 'ytBridge' },
    { in: 'background.js', out: 'background' },
    { in: 'popup.js', out: 'popup' }
  ],
  outdir: OUT_DIR,
  bundle: true,
  target: 'chrome110',
  logLevel: 'info'
});

// Тестові CJS-бандли чистих модулів — окремо від розширення, для tests/run.js
await build({
  entryPoints: [
    'src/subtitleParser.ts',
    'src/cacheKey.ts',
    'src/youtubeCaptions.ts'
  ],
  outdir: `${OUT_DIR}/test`,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'info'
});

for (const file of STATIC_FILES) {
  cpSync(file, `${OUT_DIR}/${file}`);
}
for (const dir of STATIC_DIRS) {
  cpSync(dir, `${OUT_DIR}/${dir}`, { recursive: true });
}

console.log('[build] dist/ готовий — chrome://extensions → Load unpacked → dist/');
