# Chrome Web Store — готові тексти для форм

Копіювати як є. Відповіді для рецензентів — англійською (рецензія англомовна),
опис листингу — українською (цільова аудиторія).

Джерела вимог:
- https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- https://developer.chrome.com/docs/webstore/images
- https://developer.chrome.com/blog/cws-policy-updates-2026 (чинне з 1 серпня 2026)

---

## Store listing

**Name** (з manifest, змінити вже не вийде після завантаження)

```
Subtitle Translator
```

**Short description** — рівно те, що в manifest, максимум 132 символи

```
Інтерактивні субтитри з AI-перекладом для YouTube
```

**Category:** Education
**Language:** Ukrainian

**Detailed description** (до 16 000 символів)

```
Subtitle Translator перетворює субтитри YouTube на інструмент вивчення мови.

Клік по слову в субтитрах — і переклад з'являється тут же, без пауз і перемикання
на словник в іншій вкладці. Переклад робить AI, тому враховується контекст репліки:
"get" у "get up" і "get it" перекладається по-різному.

ЩО ВМІЄ

• Переклад слова, фрази або цілої репліки — на вибір
• Врахування контексту: модель бачить сусідній рядок субтитрів
• Особистий словник: збережене слово синхронізується між пристроями
• Повторення за інтервалами: слова повертаються рівно тоді, коли починають забуватися
• Підсвітка знайомих слів у субтитрах — видно, що вже вивчено
• Індикатор складності відео до початку перегляду
• Блок частих звернень: слова, до яких ви повертаєтесь найчастіше
• Практика вимови: вимовити репліку і почути, наскільки збіглося
• Озвучення слів — вбудованим синтезом браузера, без мережі
• Історія перекладів з пошуком і статистикою занять
• Інтерфейс українською, англійською або польською — на вибір

ЯК ПРАЦЮЄ ПЕРЕКЛАД

Два режими на вибір.

Вбудований ключ — вмикаєте і працюєте, з денним лімітом звернень. Працює на
безкоштовному тарифі Gemini, а це означає, що Google може використовувати надісланий
текст для покращення своїх моделей.

Власний ключ Gemini — запит іде з вашого браузера напряму до Google, наш сервер його
не бачить. Ключ шифрується перед збереженням на акаунті.

ПРИВАТНІСТЬ

Розширення працює лише на youtube.com. Воно не читає інші сайти, не збирає історію
браузера, не має реклами й аналітики. До AI надсилається тільки той текст субтитрів,
який ви виділили, разом із сусіднім рядком як контекстом.

Політика приватності: https://stream-translate-production-4e61.up.railway.app/privacy.html
Умови користування: https://stream-translate-production-4e61.up.railway.app/terms.html

ПОТРІБНО ЗНАТИ

Відео мусить мати субтитри — власні або автоматичні. Для збереження слів між
пристроями потрібен вхід через Google; без входу переклад працює, а словник
лишається лише на цьому комп'ютері.
```

---

## Privacy practices

### Single purpose description

```
Subtitle Translator turns YouTube subtitles into an interactive language-learning
surface. The user clicks a word or phrase inside the captions and receives an
AI translation in place, and can save that word to a personal review deck.

Every feature serves this one purpose: inline translation, the saved-word deck with
spaced repetition, highlighting of already-learned words in the captions, lookup
history with study statistics, and pronunciation practice on the current subtitle
line. The extension runs only on youtube.com and does nothing outside the context
of learning a language from video subtitles.
```

### Data handling disclosure (текст для поля, якщо його запитають)

```
Subtitle text the user selects, together with the adjacent caption line as context, is
sent to the Gemini API for translation. When the built-in key is used, the request goes
through our own backend, which also caches the finished translation so the same line is
not paid for twice; that cache holds no reference to the user who requested it. The
built-in key currently runs on the Gemini free tier, where Google may use submitted
content to improve its models — this is stated plainly in our privacy policy, and users
can avoid it entirely by supplying their own key, in which case the request goes from
the browser straight to Google and never reaches our server.

Account data is limited to the email address and display name from Google Sign-In, the
saved-word deck, lookup history, and settings. Servers are in the Netherlands (Railway)
and the United Kingdom (Neon).
```

### Permission justifications

**storage**

```
Stores the user's settings (language pair, model, key source, interface language), a
local cache of already-translated phrases, and an offline copy of the saved-word deck.
Without it the user would re-enter settings on every page load and would pay for
identical translations repeatedly, since the same subtitle line is often replayed.
```

Дозволу `unlimitedStorage` в маніфесті бути не повинно — словник із коротких рядків
ніколи не наблизиться до ліміту 10 МБ, тож обґрунтувати його нічим, а кожен зайвий
дозвіл — це додаткова причина для відмови. Прибрати перед збіркою.

**identity**

```
Used solely to run the Google sign-in popup via chrome.identity.launchWebAuthFlow,
requesting only the "openid email profile" scopes. The resulting Google id_token is
exchanged once with our own backend for our own session tokens; it is never used to
call any other Google API. Sign-in exists so the user's saved-word deck and review
schedule are available on their other devices. The extension is fully usable without
signing in, with the deck kept locally.
```

**Host permission — generativelanguage.googleapis.com**

```
The Gemini API endpoint that produces the translation. Called directly from the
extension when the user chooses to use their own API key. The request body contains
only the subtitle text the user selected and the adjacent subtitle line as context.
```

**Host permission — stream-translate-production-4e61.up.railway.app**

```
Our own backend. Handles sign-in, settings sync, the saved-word deck and its review
schedule, lookup history, and proxy translation for users who do not have their own
Gemini key. It is a single fixed origin compiled into the build; the extension cannot
be pointed at any other server at runtime.
```

**Content scripts on youtube.com**

```
The extension's entire function is the interactive subtitle overlay rendered on
YouTube watch pages: reading the caption track, making words clickable, and showing
the translation tooltip. music.youtube.com is explicitly excluded because it has no
subtitles.
```

### Remote code

Обрати **"No, I am not using remote code"**. Обґрунтування, якщо запитають:

```
All JavaScript is bundled into the package by esbuild. The extension only exchanges
JSON with HTTP APIs and never loads, evaluates, or injects externally hosted code.
```

### Data usage — які категорії позначати

| Категорія | Позначати | Чому |
|---|---|---|
| Personally identifiable information | **Так** | email і display name з Google-акаунта |
| Authentication information | **Так** | ключ Gemini користувача — це креденшел, навіть зашифрований |
| Website content | **Так** | текст субтитрів зі сторінки надсилається на переклад |
| User activity | **Так** | звернення до слів записуються в історію та статистику |
| Web history | **Так** | зберігається посилання на відео, де було звернення |
| Location | Ні | — |
| Health information | Ні | — |
| Financial and payment information | Ні | — |
| Personal communications | Ні | — |

`Web history` найлегше пропустити: посилання на відео виглядає безневинно, але
формально це запис відвіданої сторінки. З політикою Disclosure Requirements від
1 серпня 2026 будь-який незадекларований збір є підставою для санкцій — навіть
якщо він прямо пов'язаний із призначенням розширення.

### Три сертифікації

Позначити всі три — всі три відповідають дійсності:

1. Дані не продаються і не передаються третім сторонам поза дозволеними випадками
2. Дані не використовуються для цілей, не пов'язаних з єдиним призначенням
3. Дані не використовуються для оцінки кредитоспроможності

### Privacy policy URL

```
https://stream-translate-production-4e61.up.railway.app/privacy.html
```

Умови користування окремим полем у формі не передбачені — посилання на них іде в описі
листингу і всередині самої політики:

```
https://stream-translate-production-4e61.up.railway.app/terms.html
```

---

## Test instructions (поле для рецензента)

Розширення без входу перекладає, але словник не синхронізує. Рецензент має побачити
обидва шляхи, тож інструкція мусить бути точною:

```
No test account is required.

1. Open any YouTube video that has subtitles, for example
   https://www.youtube.com/watch?v=dQw4w9WgXcQ
2. Turn on subtitles with the "CC" button in the player.
3. Click any word in the subtitle line. A tooltip appears with the translation,
   part of speech, and an example sentence. This uses the built-in key and requires
   no sign-in.
4. Click the bookmark icon in the tooltip to save the word. Without signing in the
   word is stored locally.
5. Optional: click the extension icon and sign in with any Google account to see the
   deck sync and the review scheduler. Sign-in requests only email and profile.

If translation returns a quota error, the shared daily limit for the built-in key has
been reached; entering any valid Gemini API key in the popup bypasses it.
```
