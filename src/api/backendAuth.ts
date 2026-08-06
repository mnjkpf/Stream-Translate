// Інтеграція з нашим бекендом (auth + авторизований доступ до API).
// Живе у background service worker: усі мережеві виклики до бекенду тут, а
// content-script'и ходять сюди через chrome.runtime.sendMessage (так само, як
// уже роблять для Gemini-перекладу). Наслідки такого рішення:
//   - токени ніколи не потрапляють у контекст сторінки (лише у storage + воркер);
//   - launchWebAuthFlow доступний тільки в extension-контексті, не в content-script;
//   - fetch із воркера до домену з host_permissions НЕ підпадає під CORS,
//     тому бекенду не потрібна окрема CORS-конфігурація для розширення.

import { STORAGE } from '../shared/messages';

// TODO(config): підстав свій Web OAuth Client ID з Google Cloud Console,
// а для прод — реальний домен бекенду замість localhost.
const BACKEND_BASE = 'http://localhost:8080';
const GOOGLE_CLIENT_ID = '920419028505-459nmrlmq5fqb6hmvhl5odclptgcct8f.apps.googleusercontent.com';

const TOKENS_KEY = STORAGE.tokens;   // { accessToken, refreshToken } — наші JWT, не Google
const PROFILE_KEY = STORAGE.profile; // { email, name } — лише для показу в UI

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

interface Profile {
  email: string | null;
  name: string | null;
}

export interface AuthStatus {
  loggedIn: boolean;
  email: string | null;
}

// ─── Публічне API (викликається з message-хендлерів у background.js) ──────────

// Повний флоу логіну: Google id_token → обмін на наші токени → збереження.
export async function login(): Promise<AuthStatus> {
  const idToken = await getGoogleIdToken();
  const profile = decodeProfile(idToken); // email/name для UI, довіра лише для показу

  const resp = await fetch(`${BACKEND_BASE}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken })
  });
  if (!resp.ok) {
    throw new Error(`Бекенд відхилив логін (${resp.status})`);
  }

  const tokens = (await resp.json()) as Tokens;
  await chrome.storage.local.set({ [TOKENS_KEY]: tokens, [PROFILE_KEY]: profile });

  // Одразу підтягуємо збережені за акаунтом налаштування (apiKey/мови/модель) у
  // chrome.storage.local — щоб ключ «сам вставився» і translate/background
  // працювали без змін (вони читають зі storage). Best-effort: збій не валить логін.
  await pullSettingsIntoStorage();

  // Слова, збережені до логіну, лежать у локальному wordbook — переносимо їх
  // на акаунт, інакше вони б назавжди лишились невидимими у вкладці «Слова».
  await migrateLocalWordbook();

  await bumpWordsRevision();
  return { loggedIn: true, email: profile.email };
}

export async function logout(): Promise<AuthStatus> {
  await chrome.storage.local.remove([TOKENS_KEY, PROFILE_KEY]);
  return { loggedIn: false, email: null };
}

export async function getStatus(): Promise<AuthStatus> {
  const data = await chrome.storage.local.get([TOKENS_KEY, PROFILE_KEY]);
  const tokens = data[TOKENS_KEY] as Tokens | undefined;
  const profile = data[PROFILE_KEY] as Profile | undefined;
  return { loggedIn: Boolean(tokens?.accessToken), email: profile?.email ?? null };
}

// Авторизований виклик нашого API. На 401 один раз пробує рефреш і повторює
// запит; якщо рефреш теж не вдався — кидає NOT_LOGGED_IN (токени вже очищені).
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  let tokens = await readTokens();
  if (!tokens) throw new Error('NOT_LOGGED_IN');

  let resp = await doFetch(path, options, tokens.accessToken);
  if (resp.status === 401) {
    tokens = await refresh(tokens.refreshToken);
    if (!tokens) throw new Error('NOT_LOGGED_IN');
    resp = await doFetch(path, options, tokens.accessToken);
  }
  return resp;
}

// ─── Профіль, налаштування, словник (через apiFetch) ─────────────────────────

export interface MeProfile {
  email: string | null;
  displayName: string | null;
  createdAt: string | null;
  settings: Record<string, string>;
}

export interface SavedWord {
  id: string;
  text: string;
  lemma: string;
  pos: string | null;
  translation: string;
  example: string | null;
  sourceLang: string;
  targetLang: string;
  context: string | null;
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

// Дані для збереження слова на бекенді (POST /words). Формат бекендного WordRequest.
export interface NewWord {
  text: string;
  lemma: string;
  pos: string | null;
  translation: string;
  example: string | null;
  sourceLang: string;
  targetLang: string;
  context: string | null;
  sourceUrl: string | null;
}

export async function getMe(): Promise<MeProfile> {
  const resp = await apiFetch('/me');
  if (!resp.ok) throw new Error(`GET /me -> ${resp.status}`);
  return (await resp.json()) as MeProfile;
}

export async function updateSettings(settings: Record<string, string>): Promise<MeProfile> {
  const resp = await apiFetch('/me/settings', { method: 'PUT', body: JSON.stringify(settings) });
  if (!resp.ok) throw new Error(`PUT /me/settings -> ${resp.status}`);
  return (await resp.json()) as MeProfile;
}

export async function listWords(): Promise<SavedWord[]> {
  const resp = await apiFetch('/words');
  if (!resp.ok) throw new Error(`GET /words -> ${resp.status}`);
  return (await resp.json()) as SavedWord[];
}

export async function deleteWord(id: string): Promise<void> {
  const resp = await apiFetch(`/words/${id}`, { method: 'DELETE' });
  // 404 = слова вже нема; для UI це той самий результат, що й успішне видалення.
  if (!resp.ok && resp.status !== 404) throw new Error(`DELETE /words/${id} -> ${resp.status}`);
}

// POST /words — upsert на бекенді (повторне слово оновлює наявне, не падає на constraint).
export async function saveWordRemote(word: NewWord): Promise<SavedWord> {
  const resp = await apiFetch('/words', { method: 'POST', body: JSON.stringify(word) });
  if (!resp.ok) throw new Error(`POST /words -> ${resp.status}`);
  return (await resp.json()) as SavedWord;
}

// Інкремент лічильника змін словника — сигнал для popup/панелі перечитати дані
// (chrome.storage.onChanged долітає в усі контексти без перезавантаження сторінки).
export async function bumpWordsRevision(): Promise<void> {
  const data = await chrome.storage.local.get(STORAGE.wordsRevision);
  const next = (Number(data[STORAGE.wordsRevision]) || 0) + 1;
  await chrome.storage.local.set({ [STORAGE.wordsRevision]: next });
}

// Переносить локально збережені слова на акаунт після логіну. POST /words на
// бекенді ідемпотентний (upsert за user+lemma+мови), тож повтор безпечний.
// Локальний wordbook чистимо лише якщо ВСІ слова перенеслись, інакше лишаємо
// як є — краще спробувати ще раз наступного логіну, ніж втратити дані.
async function migrateLocalWordbook(): Promise<void> {
  try {
    const data = await chrome.storage.local.get(STORAGE.wordbook);
    const wordbook = (data[STORAGE.wordbook] ?? []) as Array<{
      word: string; translation: string; context?: string;
    }>;
    if (wordbook.length === 0) return;

    const settings = await chrome.storage.local.get([STORAGE.sourceLang, STORAGE.targetLang]);
    const sourceLang = settings[STORAGE.sourceLang] || 'English';
    const targetLang = settings[STORAGE.targetLang] || 'Ukrainian';

    let migrated = 0;
    for (const entry of wordbook) {
      if (!entry?.word || !entry?.translation) { migrated++; continue; } // биті записи просто відкидаємо
      try {
        await saveWordRemote({
          text: entry.word,
          lemma: entry.word,
          pos: null,
          translation: entry.translation,
          example: null,
          sourceLang,
          targetLang,
          context: entry.context ?? null,
          sourceUrl: null
        });
        migrated++;
      } catch {
        // мережа/валідація — лишаємо запис на наступну спробу
      }
    }

    if (migrated === wordbook.length) await chrome.storage.local.remove(STORAGE.wordbook);
  } catch {
    // ignore — міграція не має блокувати логін
  }
}

// ─── Проксі-переклад (вбудований ключ) ───────────────────────────────────────

export interface ProxyTranslation {
  translation: string;
  cached: boolean;
  remaining: number;
}

export interface ProxyQuota {
  enabled: boolean;
  used: number;
  limit: number;
  remaining: number;
}

// Помилка проксі з кодом від бекенда (USER_QUOTA / GLOBAL_QUOTA / PROXY_DISABLED),
// щоб UI міг відрізнити «зачекай до завтра» від «увімкни свій ключ».
export class ProxyError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

// Сервер сам будує промпт із цих полів — навмисно не шлемо готовий текст промпту,
// інакше ендпоінт став би безкоштовним чатом загального призначення.
export async function translateViaProxy(payload: {
  text: string;
  context: string;
  mode: string;
  sourceLang: string;
  targetLang: string;
}): Promise<ProxyTranslation> {
  const resp = await apiFetch('/translate', { method: 'POST', body: JSON.stringify(payload) });
  if (resp.ok) return (await resp.json()) as ProxyTranslation;

  let code = 'UPSTREAM_ERROR';
  let message = `Помилка перекладу (${resp.status})`;
  try {
    const body = await resp.json();
    code = body.code ?? code;
    message = body.message ?? message;
  } catch {
    // тіло не JSON — лишаємо узагальнене повідомлення
  }
  throw new ProxyError(code, message);
}

export async function getProxyQuota(): Promise<ProxyQuota> {
  const resp = await apiFetch('/translate/quota');
  if (!resp.ok) throw new Error(`GET /translate/quota -> ${resp.status}`);
  return (await resp.json()) as ProxyQuota;
}

// ─── Історія перекладів і статистика ─────────────────────────────────────────

export interface HistoryItem {
  id: string;
  text: string;
  translation: string;
  mode: string;
  sourceLang: string;
  targetLang: string;
  sourceUrl: string | null;
  createdAt: string;
}

export interface HistoryPage {
  items: HistoryItem[];
  page: number;
  totalPages: number;
  totalItems: number;
}

export interface StatsPoint {
  date: string;
  translations: number;
  savedWords: number;
}

// Викликається після КОЖНОГО успішного перекладу, незалежно від джерела ключа —
// у режимі «свій ключ» бекенд про переклад інакше не дізнався б узагалі.
// Best-effort: історія не має ламати сам переклад, тому помилки ковтаємо.
export async function recordHistory(entry: {
  text: string;
  translation: string;
  mode: string;
  sourceLang: string;
  targetLang: string;
  sourceUrl: string | null;
}): Promise<void> {
  try {
    await apiFetch('/history', { method: 'POST', body: JSON.stringify(entry) });
  } catch {
    // не залогінений або мережа — переклад користувач уже отримав
  }
}

export async function listHistory(query: string, page: number): Promise<HistoryPage> {
  const params = new URLSearchParams({ page: String(page), size: '50' });
  if (query) params.set('query', query);
  const resp = await apiFetch(`/history?${params.toString()}`);
  if (!resp.ok) throw new Error(`GET /history -> ${resp.status}`);
  return (await resp.json()) as HistoryPage;
}

export async function getStats(days: number): Promise<StatsPoint[]> {
  const resp = await apiFetch(`/stats?days=${days}`);
  if (!resp.ok) throw new Error(`GET /stats -> ${resp.status}`);
  return (await resp.json()) as StatsPoint[];
}

// Копіює apiKey/sourceLang/targetLang/model з акаунта у chrome.storage.local.
// Best-effort: будь-який збій ковтаємо (логін не має падати через це).
async function pullSettingsIntoStorage(): Promise<void> {
  try {
    const me = await getMe();
    const s = me.settings ?? {};
    const patch: Record<string, string> = {};
    for (const key of ['apiKey', 'sourceLang', 'targetLang', 'model', 'keySource'] as const) {
      if (s[key]) patch[key] = s[key];
    }
    if (Object.keys(patch).length > 0) await chrome.storage.local.set(patch);
  } catch {
    // ignore — акаунт міг ще не мати збережених налаштувань
  }
}

// ─── Внутрішнє ───────────────────────────────────────────────────────────────

function doFetch(path: string, options: RequestInit, accessToken: string): Promise<Response> {
  const headers = new Headers(options.headers ?? {});
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${BACKEND_BASE}${path}`, { ...options, headers });
}

async function readTokens(): Promise<Tokens | null> {
  const data = await chrome.storage.local.get(TOKENS_KEY);
  const tokens = data[TOKENS_KEY] as Tokens | undefined;
  return tokens?.accessToken ? tokens : null;
}

// Обмін refresh-токена на новий access. Провал (refresh протермінувався/невалідний)
// чистить токени — наступний getStatus() поверне loggedIn:false і UI покаже Login.
async function refresh(refreshToken: string): Promise<Tokens | null> {
  const resp = await fetch(`${BACKEND_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });
  if (!resp.ok) {
    await chrome.storage.local.remove([TOKENS_KEY, PROFILE_KEY]);
    return null;
  }
  const tokens = (await resp.json()) as Tokens;
  await chrome.storage.local.set({ [TOKENS_KEY]: tokens });
  return tokens;
}

// Implicit-флоу Google (response_type=id_token) через керований Chrome попап.
// redirect_uri = getRedirectURL() має точно збігатися з Authorized redirect URI
// в Google Cloud Console (включно з фінальним слешем).
async function getGoogleIdToken(): Promise<string> {
  const redirectUri = chrome.identity.getRedirectURL();
  const nonce = crypto.randomUUID(); // Google вимагає nonce для id_token implicit-флоу
  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth'
    + `?client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}`
    + '&response_type=id_token'
    + `&redirect_uri=${encodeURIComponent(redirectUri)}`
    + `&scope=${encodeURIComponent('openid email profile')}`
    + `&nonce=${encodeURIComponent(nonce)}`
    + '&prompt=consent';

  const redirectResponse = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });

  // id_token приходить у фрагменті (#id_token=...&...), не в query.
  const fragment = new URL(redirectResponse).hash.slice(1);
  const idToken = new URLSearchParams(fragment).get('id_token');
  if (!idToken) throw new Error('Google не повернув id_token');
  return idToken;
}

// Дістаємо email/name з payload Google id_token ЛИШЕ для показу в UI.
// Підпис тут не перевіряється — справжню перевірку робить бекенд
// (GoogleTokenVerifier), тому цим значенням довіряємо тільки для відображення.
function decodeProfile(idToken: string): Profile {
  try {
    const b64 = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as { email?: string; name?: string };
    return { email: claims.email ?? null, name: claims.name ?? null };
  } catch {
    return { email: null, name: null };
  }
}
