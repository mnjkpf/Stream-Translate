// Background service worker
// Відповідає за:
// - виклик Gemini API
// - кеш перекладів у chrome.storage.local
// - збереження вивчених слів

importScripts('src/cacheKey.js');

const GEMINI_MODEL = 'gemini-2.0-flash'; // дефолт, якщо в popup не задано інший (M-6)
const CACHE_PREFIX = 'tr:'; // tr:{mode}:{src}:{tgt}:{hash(context)}:{text_lowercase} — див. cacheKey.js
const WORDBOOK_MAX_ENTRIES = 2000; // M-2: ротація — старі записи витісняються новими
const GEMINI_REQUEST_TIMEOUT_MS = 15000; // M-4: щоб tooltip не завис на "Перекладаю..." навічно

// L-10: одне місце для всіх текстів помилок — мінімум для майбутньої i18n
const MESSAGES = {
  apiKeyMissing: 'API ключ не налаштовано. Натисни на іконку розширення.',
  requestTimeout: (seconds) => `Gemini не відповів за ${seconds}с. Спробуйте ще раз.`,
  rateLimited: 'Перевищено ліміт запитів до Gemini. Зачекайте трохи і спробуйте знову.',
  overloaded: 'Gemini тимчасово недоступний (перевантажений). Спробуйте пізніше.',
  modelNotFound: (model) => `Модель "${model}" не знайдена. Перевірте назву моделі в налаштуваннях.`,
  genericApiError: (status, body) => `Gemini API ${status}: ${body}`,
  emptyResponse: 'Порожня відповідь від Gemini'
};

// Слухаємо повідомлення від content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // L-12: приймаємо повідомлення лише від власного розширення
  if (sender.id !== chrome.runtime.id) return;

  if (msg.type === 'translate') {
    handleTranslate(msg).then(sendResponse).catch(err => {
      console.error('Translate error:', err);
      sendResponse({ error: err.message || String(err) });
    });
    return true; // async
  }

  if (msg.type === 'saveWord') {
    saveWord(msg.word, msg.translation, msg.context)
      .then(sendResponse)
      .catch(err => {
        console.error('Save word error:', err);
        sendResponse({ error: err.message || String(err) });
      });
    return true;
  }
});

async function handleTranslate({ text, context, mode }) {
  const settings = await chrome.storage.local.get(['apiKey', 'sourceLang', 'targetLang', 'model']);

  if (!settings.apiKey) {
    return { error: MESSAGES.apiKeyMissing };
  }

  const sourceLang = settings.sourceLang || 'English';
  const targetLang = settings.targetLang || 'Ukrainian';
  const model = settings.model || GEMINI_MODEL; // M-6: модель налаштовується в popup

  // Перевіряємо кеш (ключ враховує mode і хеш контексту — H-1)
  const cacheKey = CacheKeyUtil.buildCacheKey(CACHE_PREFIX, mode, sourceLang, targetLang, text, context);
  const cached = await chrome.storage.local.get(cacheKey);
  if (cached[cacheKey]) {
    return { translation: cached[cacheKey], cached: true };
  }

  // Викликаємо Gemini
  const prompt = buildPrompt(text, context, mode, sourceLang, targetLang);
  const translation = await callGemini(prompt, settings.apiKey, model);

  // Зберігаємо в кеш (тільки короткі — щоб не засмічувати storage)
  if (text.length < 80) {
    await chrome.storage.local.set({ [cacheKey]: translation });
  }

  return { translation, cached: false };
}

function buildPrompt(text, context, mode, sourceLang, targetLang) {
  if (mode === 'word') {
    return `You are a dictionary translator helping someone learn ${sourceLang}.

Word: "${text}"
Sentence context: "${context}"

Task: Translate the word "${text}" to ${targetLang} considering its meaning in this specific sentence.

Respond in this exact format (no markdown, no explanations):
LEMMA: <base form of the word in ${sourceLang}>
POS: <part of speech: noun/verb/adjective/adverb/etc>
TRANSLATION: <1-3 ${targetLang} translations separated by commas, most relevant to context first>
EXAMPLE: <a short ${sourceLang} example sentence using this word>`;
  }

  // mode === 'phrase'
  return `You are translating a phrase from a movie subtitle.

Full subtitle: "${context}"
Selected phrase: "${text}"

Translate the selected phrase to ${targetLang}, preserving the meaning in context. If it's an idiom or fixed expression, give the natural ${targetLang} equivalent rather than literal translation.

Respond with ONLY the ${targetLang} translation, nothing else. No quotes, no explanations.`;
}

async function callGemini(prompt, apiKey, model) {
  // M-1: ключ у заголовку, а не в query-рядку — секрети в URL легше
  // засвітити в логах проксі/devtools/історії редіректів
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  // M-4: без цього fetch міг зависнути назавжди, і tooltip назавжди
  // лишався б на "Перекладаю..."
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 500 // L-13: трохи запасу, щоб довгий EXAMPLE не обрізався
        }
      }),
      signal: controller.signal
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(MESSAGES.requestTimeout(GEMINI_REQUEST_TIMEOUT_MS / 1000));
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    // M-4: локалізовані повідомлення для найчастіших кодів помилок
    if (response.status === 429) {
      throw new Error(MESSAGES.rateLimited);
    }
    if (response.status === 503) {
      throw new Error(MESSAGES.overloaded);
    }
    if (response.status === 404) {
      throw new Error(MESSAGES.modelNotFound(model));
    }
    const errText = await response.text();
    throw new Error(MESSAGES.genericApiError(response.status, errText.slice(0, 200)));
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(MESSAGES.emptyResponse);
  return text.trim();
}

// M-3: два швидкі saveWord() поспіль обидва читають wordbook до того, як
// хтось встиг записати назад — останній set() затирає перший доданий
// запис. Серіалізуємо через ланцюжок промісів так, щоб кожен виклик
// чекав на завершення (успішне чи ні) попереднього перед своїм read-modify-write.
let saveWordChain = Promise.resolve();

function saveWord(word, translation, context) {
  const result = saveWordChain.then(
    () => doSaveWord(word, translation, context),
    () => doSaveWord(word, translation, context)
  );
  // Ланцюг не має лишитись "відхиленим" назавжди — інакше всі наступні
  // збереження чекатимуть на проміс, що вже ніколи не вирішиться в успіх
  saveWordChain = result.catch(() => {});
  return result;
}

async function doSaveWord(word, translation, context) {
  const key = 'wordbook';
  const data = await chrome.storage.local.get(key);
  const wordbook = data[key] || [];
  wordbook.push({
    word,
    translation,
    context,
    addedAt: Date.now()
  });
  // M-2: ротація — не даємо словнику рости безкінечно, лишаємо найновіші
  if (wordbook.length > WORDBOOK_MAX_ENTRIES) {
    wordbook.splice(0, wordbook.length - WORDBOOK_MAX_ENTRIES);
  }
  await chrome.storage.local.set({ [key]: wordbook });
  return { ok: true };
}
