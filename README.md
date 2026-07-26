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
`chrome://extensions` → увімкнути Developer mode → **Load unpacked** → ця папка.
Вписати свій Gemini API-ключ у налаштуваннях розширення.

## Розробка
```
npm install
npm run build      # → dist/ (Load unpacked звідси теж працює)
npm test           # node tests/run.js
npm run typecheck  # tsc --noEmit
```
