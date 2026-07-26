# Stream Translate

Інтерактивні субтитри з AI-перекладом (Google Gemini) для стрімінгових сервісів.
Публічний білд: **YouTube** (Netflix та інші — далі).

## Можливості
- Клік по слову — переклад слова; протягування — переклад фрази.
- Автопідхоплення рідних субтитрів YouTube (ручні + авто/ASR), з резервним DOM-фолбеком.
- Кнопка налаштувань прямо в плеєрі + popup. Ключ Gemini зберігається локально в браузері.

## Гілки
- `develope` — робоча.
- `main` — релізна (порожня до першого релізу).

## Локальний запуск
Джерела — TypeScript, тому спочатку потрібна збірка (репозиторій напряму
як unpacked-розширення вже не вантажиться):
```
npm install
npm run build
```
Потім `chrome://extensions` → увімкнути Developer mode → **Load unpacked** → папка **`dist/`**.
Вписати свій Gemini API-ключ у налаштуваннях розширення.

## Розробка
```
npm run build      # → dist/, готова до Load unpacked
npm test           # build + node tests/run.js
npm run typecheck  # tsc --noEmit
```
