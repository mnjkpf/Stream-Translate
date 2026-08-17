// Збірка розширення: dist/ стає готовою до "Load unpacked" копією.
//
// Структура джерел (див. docs/ARCHITECTURE.md):
//   src/background/ — service worker: мережа, токени, Gemini, кеш
//   src/popup/      — UI вкладок (профіль / слова / налаштування)
//   src/content/    — те, що працює на сторінці (adapters / subtitles / overlay)
//   src/dashboard/  — окрема вкладка зі статистикою, історією та повтореннями
//   src/api/        — клієнт нашого бекенду + тонка обгортка для UI
//   src/shared/     — спільне для всіх бандлів (константи, i18n, утиліти)
//
// Кожна точка входу бандлиться окремо — контексти Chrome ізольовані один від
// одного й не можуть ділити рантайм:
//   src/content/index.ts             → dist/content.js   (ISOLATED world)
//   src/content/adapters/ytBridge.js → dist/ytBridge.js  (MAIN world, окремо)
//   src/background/index.js          → dist/background.js (service worker)
//   src/popup/index.js               → dist/popup.js
//   src/dashboard/index.js           → dist/dashboard.js
//
// dist/ лишається ПЛАСКИМ: manifest.json посилається на імена файлів у корені
// dist, тому переїзд джерел по папках його не зачіпає. Репозиторій напряму як
// unpacked-розширення не вантажиться — спочатку `npm run build`, потім dist/.
//
// ── Два режими збірки ───────────────────────────────────────────────────────
//   node build.mjs                                  dev  → localhost:8080
//   node build.mjs --prod --backend=https://api...  prod → для Chrome Web Store
//
// Адреса бекенду підставляється на збірці (esbuild define), а не читається зі
// storage у рантаймі. Це свідомо: адреса бекенду — не налаштування користувача.
// Якби її можна було змінити з UI, підміна адреси віддавала б чужі токени
// стороннього серверу. Збірковий параметр змінити в рантаймі неможливо взагалі.
//
// Прод-збірка додатково: не кладе dist/test/ (тестові CJS-бандли в магазині
// ні до чого) і підставляє прод-домен у host_permissions маніфесту.

import { build } from 'esbuild';
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const OUT_DIR = 'dist';
const DEV_BACKEND = 'http://localhost:8080';

// ── Аргументи ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const isProd = args.includes('--prod');
const backendArg = args.find((a) => a.startsWith('--backend='))?.slice('--backend='.length);
const backendBase = (backendArg ?? process.env.BACKEND_BASE ?? DEV_BACKEND).replace(/\/+$/, '');

// Запобіжники прод-збірки. Найдорожча помилка тут — залити в Chrome Web Store
// білд, що ходить на localhost: у чужому браузері він мовчки не працює, а нова
// версія проходить перевірку магазину днями. Тому падаємо на збірці, а не потім.
if (isProd) {
  if (backendBase === DEV_BACKEND || /localhost|127\.0\.0\.1/.test(backendBase)) {
    console.error('[build] --prod із локальною адресою бекенду. Вкажи --backend=https://…');
    process.exit(1);
  }
  if (!backendBase.startsWith('https://')) {
    // JWT ходить у заголовку кожного запиту; http зробив би його видимим у
    // будь-якій мережі між користувачем і сервером. Плюс Web Store не пропускає
    // http-дозволи на зовнішні домени.
    console.error(`[build] --prod вимагає https, отримано: ${backendBase}`);
    process.exit(1);
  }
}

// Для host_permissions потрібен origin із маскою шляху, а не повний URL.
const backendOrigin = new URL(backendBase).origin;

// [шлях у джерелах, ім'я у dist/] — джерела лежать по папках, dist плаский.
// manifest.json тут немає: він не копіюється, а збирається нижче (підстановка домену).
const STATIC_FILES = [
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
  // Значення інлайниться в кожен бандл на місці __BACKEND_BASE__ (тип — у
  // src/shared/buildEnv.d.ts). Мініфікацію свідомо не вмикаємо: Google при
  // перевірці віддає перевагу читабельному коду, а виграш у розмірі тут копійчаний.
  define: { __BACKEND_BASE__: JSON.stringify(backendBase) },
  logLevel: 'info'
});

// Тестові CJS-бандли чистих модулів — окремо від розширення, для tests/run.js.
// Явний {in,out} обов'язковий: джерела лежать у різних теках, і без нього
// esbuild відтворив би структуру папок від спільного предка
// (dist/test/content/subtitles/...), а tests/run.js чекає файли плоско.
if (!isProd) {
  await build({
    entryPoints: [
      { in: 'src/content/subtitles/subtitleParser.ts', out: 'subtitleParser' },
      { in: 'src/content/subtitles/youtubeCaptions.ts', out: 'youtubeCaptions' },
      { in: 'src/shared/cacheKey.ts', out: 'cacheKey' },
      { in: 'src/shared/pronunciationMatch.ts', out: 'pronunciationMatch' },
      // i18n тестується без chrome.*: initI18n() (єдине місце, що читає storage)
      // у тестах не викликається, мова задається напряму через setLang().
      { in: 'src/shared/i18n.ts', out: 'i18n' }
    ],
    outdir: `${OUT_DIR}/test`,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    logLevel: 'info'
  });
}

for (const [from, to] of STATIC_FILES) {
  cpSync(from, `${OUT_DIR}/${to}`);
}
for (const [from, to] of STATIC_DIRS) {
  cpSync(from, `${OUT_DIR}/${to}`, { recursive: true });
}

// ── manifest.json: підстановка домену бекенду ───────────────────────────────
// У джерелі стоїть плейсхолдер __BACKEND_ORIGIN__, щоб файл лишався єдиним
// джерелом правди про дозволи (видно весь набір), а не добудовувався тут наосліп.
const manifestSrc = readFileSync('manifest.json', 'utf8');
const manifestOut = manifestSrc.replaceAll('__BACKEND_ORIGIN__', backendOrigin);

if (manifestOut.includes('__')) {
  // Плейсхолдер, який лишився на місці, доїхав би в магазин як буквальний рядок
  // і зламав би дозволи. Дешевше впасти тут.
  console.error('[build] у manifest.json лишився непідставлений плейсхолдер');
  process.exit(1);
}
JSON.parse(manifestOut); // синтаксис після підстановки
writeFileSync(`${OUT_DIR}/manifest.json`, manifestOut);

console.log(`[build] режим: ${isProd ? 'PROD' : 'dev'}, бекенд: ${backendBase}`);
console.log(
  isProd
    ? '[build] dist/ готовий — спакуй ВМІСТ теки в zip для Chrome Web Store'
    : '[build] dist/ готовий — chrome://extensions → Load unpacked → dist/'
);
