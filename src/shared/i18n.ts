// Subtitle Translator — локалізація інтерфейсу (українська, англійська, польська).
//
// Чому не chrome.i18n з теками _locales: той механізм бере мову з налаштувань
// БРАУЗЕРА і не має API, щоб її перевизначити. Тут мову обирає користувач, тож
// потрібен власний шар зі значенням у chrome.storage.local (STORAGE.uiLang).
//
// MESSAGES лишився тим самим об'єктом, що й до локалізації: 60+ місць у коді
// звертаються до нього як MESSAGES.close або MESSAGES.pronounceScore(87), і
// переписувати їх на t('...') означало б 60 однакових правок з ризиком описки в
// кожній. Замість цього MESSAGES — Proxy, який на кожне звернення дивиться в
// словник ПОТОЧНОЇ мови. Тому зміна мови не вимагає нічого перечитувати: усе,
// що малюється після неї, вже нове.
//
// Ключі з підстановками ({0}) віддаються як функції, без підстановок — як рядки.
// Ознакою є сам шаблон, тому окремого списку «які ключі функції» не існує:
// такий список неминуче розійшовся б зі словником.

import type { SelectOption } from './constants';
import { STORAGE } from './messages';

export type Lang = 'uk' | 'en' | 'pl';

export const UI_LANGUAGES: SelectOption[] = [
  { value: 'uk', label: 'Українська' },
  { value: 'en', label: 'English' },
  { value: 'pl', label: 'Polski' }
];

const FALLBACK: Lang = 'en';

// ── Словник-еталон ───────────────────────────────────────────────────────────
// Українська — джерело правди: EN і PL нижче типізовані як Record<keyof UK>,
// тому забутий при додаванні ключ ловиться tsc, а не користувачем.
//
// Синтаксис шаблонів:
//   {0}, {1}          — підстановка аргументу за позицією
//   [форма|форма|...] — множина; форму вибирає перший числовий аргумент за
//                       правилом мови (слов'янські — три форми, англійська — дві)
const UK = {
  // ── Субтитри, завантаження файлу ──
  loadButtonIdle: 'Завантажити SRT',
  loadButtonLoaded: '{0} [субтитр|субтитри|субтитрів]',
  parseError: 'Не вдалося розпарсити субтитри. Перевір що це валідний .srt/.vtt файл.',
  fileReadError: 'Помилка читання файлу: {0}',
  fileTooLarge: 'Файл завеликий ({0} МБ). Максимум — 5 МБ.',
  videoNotFound: 'Відео плеєр не знайдено на сторінці',
  offsetIndicator: 'Зсув: {0}с  ([ ] для зміни, \\ — скинути)',
  subtitlesUnavailable: 'Субтитри недоступні для цього відео',
  subtitlesLoadError: 'Не вдалося завантажити субтитри',
  subtitleFallbackLanguage: 'Показано субтитри мовою "{0}" — обрана мова недоступна для цього відео',

  // ── Tooltip перекладу ──
  translating: 'Перекладаю...',
  tooltipAriaLabel: 'Переклад',
  saveWord: '⭐ Зберегти',
  speakWord: '🔊',
  speakWordTitle: 'Прослухати вимову',
  saveWordSaving: 'Зберігаю…',
  saveWordDone: '✓ Збережено',
  saveWordFailed: '✕ Не збережено',
  close: 'Закрити',
  phraseLabel: 'Фраза:',
  sentenceLabel: 'Рядок:',

  // ── Керування переглядом ──
  replayedLine: '↻ Повтор репліки',
  autoPauseOn: '⏸ Автопауза увімкнена (A — вимкнути)',
  autoPauseOff: '▶ Автопауза вимкнена',

  // ── Індикатор складності відео ──
  difficultyEasy: 'Легко для тебе',
  difficultyGood: 'Саме твій рівень',
  difficultyHard: 'Складнувато',
  difficultyVeryHard: 'Дуже складно',
  difficultyDetail: 'Знайомих слів: {0} з {1}',

  // ── Практика вимови ──
  pronounceListening: '🎤 Говори…',
  pronounceScore: 'Збіглося {0}%',
  pronounceHint: 'P — спробувати ще раз',
  pronounceNoCue: 'Немає активної репліки для повтору',
  pronounceUnsupported: 'Браузер не підтримує розпізнавання мовлення',
  pronounceNoMic: 'Потрібен дозвіл на мікрофон — надай його в адресному рядку',
  pronounceNoSpeech: 'Нічого не почув — спробуй ще раз',
  pronounceNetwork: 'Розпізнавання недоступне без інтернету',
  pronounceFailed: 'Не вдалося розпізнати мовлення',

  // ── Панель налаштувань на сторінці + popup ──
  settingsButtonLabel: 'Налаштування перекладача субтитрів',
  settingsPanelAriaLabel: 'Налаштування перекладача субтитрів',
  settingsApiKeyRequired: 'Введіть API ключ',
  settingsLoginRequired: 'Увійдіть, щоб використати вбудований ключ',
  settingsSaved: '✓ Збережено',
  labelGeminiKey: 'Ключ Gemini',
  keySourceOwn: 'Свій ключ',
  keySourceProxy: 'Вбудований',
  labelSourceLang: 'Мова субтитрів',
  labelTargetLang: 'Перекладати на',
  labelModel: 'Модель Gemini',
  labelUiLang: 'Мова інтерфейсу',
  btnSave: 'Зберегти',
  proxyHintOk: 'Переклад іде через сервер — власний ключ не потрібен.',
  proxyHintLoginRequired: 'Потрібно увійти — вбудований ключ доступний лише з акаунтом.',
  getKeyFree: 'Отримати безкоштовно:',

  // ── Акаунт ──
  accountLoggedOut: 'Не увійдено',
  accountLoggedIn: '{0}',
  accountLoginBtn: 'Увійти через Google',
  accountLogoutBtn: 'Вийти',
  accountBusy: '…',
  accountLoginFailed: 'Не вдалося увійти',

  // ── Popup ──
  popupSubtitle: 'AI-переклад субтитрів',
  tabProfile: 'Профіль',
  tabWords: 'Слова',
  tabSettings: 'Налаштування',
  profileLoginPrompt: 'Увійдіть, щоб синхронізувати слова й налаштування між пристроями.',
  statWordsLabel: 'Слів',
  statWeekLabel: 'За тиждень',
  statPairsLabel: 'Мовних пар',
  openDashboard: 'Статистика та історія',
  wordsLoginPrompt: 'Увійдіть, щоб бачити збережені слова.',
  wordSearchPlaceholder: 'Пошук слова…',
  memberSince: 'На сервісі з {0}',
  quotaLeft: 'Вбудований ключ: залишилось {0} з {1} на сьогодні',
  quotaUnavailable: 'Вбудований ключ зараз недоступний — користуйтесь своїм',
  savedLocallyOnly: 'Збережено локально (бекенд недоступний)',
  wordsCount: '{0} [слово|слова|слів]',
  wordsEmpty: 'Немає збережених слів',
  nothingFound: 'Нічого не знайдено',
  deleteTitle: 'Видалити',
  errorWithText: 'Помилка: {0}',
  noResponse: 'немає відповіді',

  // ── Дашборд ──
  dashTitle: 'Статистика та історія',
  dashLoginPrompt: 'Увійдіть у розширенні, щоб побачити свою статистику та історію перекладів.',
  totalTranslationsLabel: 'Перекладів за період',
  totalWordsLabel: 'Збережено слів',
  activeDaysLabel: 'Активних днів',
  bestStreakLabel: 'Найдовша серія',
  cardReview: 'Повторення',
  cardFrequent: 'Ти постійно це шукаєш',
  frequentNote: 'Слова, які ти перекладав кілька разів, але не зберіг.',
  cardActivity: 'Активність',
  days7: '7 днів',
  days30: '30 днів',
  days90: '90 днів',
  seriesAll: 'Усе',
  seriesTranslations: 'Переклади',
  seriesWords: 'Слова',
  seriesWordsFull: 'Збережені слова',
  chartAria: 'Графік активності за обраний період',
  cardHistory: 'Історія перекладів',
  historySearchPlaceholder: 'Пошук за словом або перекладом…',
  prevPage: '← Новіші',
  nextPage: 'Старіші →',
  historyNote: 'Історія зберігається 90 днів, після чого видаляється автоматично.',
  historyLoadFailed: 'Не вдалося завантажити історію',
  historyEmpty: 'Історія порожня — перекладіть слово у відео, і воно з’явиться тут',
  pageInfo: 'Сторінка {0} з {1} · {2} [запис|записи|записів]',
  modeWord: 'слово',
  modePhrase: 'фраза',
  modeSentence: 'речення',
  toVideo: 'До відео',

  // ── Повторення (SRS) ──
  reviewLoadFailed: 'Не вдалося завантажити картки',
  reviewDone: 'Готово — повторено {0} [слово|слова|слів]. Повертайся завтра.',
  reviewEmpty: 'Немає слів до повторення. Збережи кілька слів у відео — вони з’являться тут.',
  reviewProgress: '{0} з {1}',
  showTranslation: 'Показати переклад',
  whereIMetIt: 'Де я це зустрів →',
  gradeAgain: 'Не згадав',
  gradeAgainHint: 'знову сьогодні',
  gradeHard: 'Важко',
  gradeHardHint: 'скоро',
  gradeGood: 'Згадав',
  gradeGoodHint: 'за планом',
  gradeEasy: 'Легко',
  gradeEasyHint: 'нескоро',
  gradeSaveFailed: 'Не вдалося зберегти оцінку — спробуй оновити сторінку',
  freqSave: 'Зберегти',
  freqSaving: 'Зберігаю…',
  freqFailed: 'Не вдалось',

  // ── Помилки перекладу (service worker) ──
  apiKeyMissing: 'API ключ не налаштовано. Натисни на іконку розширення.',
  requestTimeout: 'Gemini не відповів за {0}с. Спробуйте ще раз.',
  rateLimited: 'Перевищено ліміт запитів до Gemini. Зачекайте трохи і спробуйте знову.',
  overloaded: 'Gemini тимчасово недоступний (перевантажений). Спробуйте пізніше.',
  modelNotFound: 'Модель "{0}" не знайдена. Перевірте назву моделі в налаштуваннях.',
  genericApiError: 'Gemini API {0}: {1}',
  emptyResponse: 'Порожня відповідь від Gemini',
  backendRejectedLogin: 'Бекенд відхилив логін ({0})',
  translateFailed: 'Помилка перекладу ({0})',
  googleNoIdToken: 'Google не повернув id_token',

  // ── Підказки в списках (constants.ts) ──
  modelHintFastest: 'Найшвидша й найдешевша — типовий вибір',
  modelHintBalanced: 'Баланс швидкості та якості',
  modelHintAccurate: 'Найточніша — для складних діалогів',
  modelHintLegacy: 'Дешевша, попереднє покоління',
  langEnglish: 'Англійська',
  langSpanish: 'Іспанська',
  langFrench: 'Французька',
  langGerman: 'Німецька',
  langPolish: 'Польська',
  langItalian: 'Італійська',
  langUkrainian: 'Українська'
};

export type MessageKey = keyof typeof UK;

const EN: Record<MessageKey, string> = {
  loadButtonIdle: 'Load SRT',
  loadButtonLoaded: '{0} [subtitle|subtitles]',
  parseError: 'Could not parse the subtitles. Check that this is a valid .srt/.vtt file.',
  fileReadError: 'File read error: {0}',
  fileTooLarge: 'File is too large ({0} MB). The maximum is 5 MB.',
  videoNotFound: 'No video player found on this page',
  offsetIndicator: 'Offset: {0}s  ([ ] to adjust, \\ to reset)',
  subtitlesUnavailable: 'No subtitles available for this video',
  subtitlesLoadError: 'Could not load the subtitles',
  subtitleFallbackLanguage: 'Showing subtitles in "{0}" — your chosen language is unavailable for this video',

  translating: 'Translating...',
  tooltipAriaLabel: 'Translation',
  saveWord: '⭐ Save',
  speakWord: '🔊',
  speakWordTitle: 'Listen to the pronunciation',
  saveWordSaving: 'Saving…',
  saveWordDone: '✓ Saved',
  saveWordFailed: '✕ Not saved',
  close: 'Close',
  phraseLabel: 'Phrase:',
  sentenceLabel: 'Line:',

  replayedLine: '↻ Line replayed',
  autoPauseOn: '⏸ Auto-pause on (A to turn off)',
  autoPauseOff: '▶ Auto-pause off',

  difficultyEasy: 'Easy for you',
  difficultyGood: 'Right at your level',
  difficultyHard: 'A bit hard',
  difficultyVeryHard: 'Very hard',
  difficultyDetail: 'Words you know: {0} of {1}',

  pronounceListening: '🎤 Speak…',
  pronounceScore: '{0}% match',
  pronounceHint: 'P — try again',
  pronounceNoCue: 'No active line to repeat',
  pronounceUnsupported: 'This browser does not support speech recognition',
  pronounceNoMic: 'Microphone access is needed — grant it in the address bar',
  pronounceNoSpeech: 'I heard nothing — try again',
  pronounceNetwork: 'Recognition is unavailable offline',
  pronounceFailed: 'Could not recognise the speech',

  settingsButtonLabel: 'Subtitle Translator settings',
  settingsPanelAriaLabel: 'Subtitle Translator settings',
  settingsApiKeyRequired: 'Enter an API key',
  settingsLoginRequired: 'Sign in to use the built-in key',
  settingsSaved: '✓ Saved',
  labelGeminiKey: 'Gemini key',
  keySourceOwn: 'My key',
  keySourceProxy: 'Built-in',
  labelSourceLang: 'Subtitle language',
  labelTargetLang: 'Translate into',
  labelModel: 'Gemini model',
  labelUiLang: 'Interface language',
  btnSave: 'Save',
  proxyHintOk: 'Translation goes through our server — no key of your own needed.',
  proxyHintLoginRequired: 'Sign-in required — the built-in key works only with an account.',
  getKeyFree: 'Get one for free:',

  accountLoggedOut: 'Not signed in',
  accountLoggedIn: '{0}',
  accountLoginBtn: 'Sign in with Google',
  accountLogoutBtn: 'Sign out',
  accountBusy: '…',
  accountLoginFailed: 'Sign-in failed',

  popupSubtitle: 'AI subtitle translation',
  tabProfile: 'Profile',
  tabWords: 'Words',
  tabSettings: 'Settings',
  profileLoginPrompt: 'Sign in to sync your words and settings across devices.',
  statWordsLabel: 'Words',
  statWeekLabel: 'This week',
  statPairsLabel: 'Language pairs',
  openDashboard: 'Stats and history',
  wordsLoginPrompt: 'Sign in to see your saved words.',
  wordSearchPlaceholder: 'Search for a word…',
  memberSince: 'Member since {0}',
  quotaLeft: 'Built-in key: {0} of {1} left today',
  quotaUnavailable: 'The built-in key is unavailable right now — use your own',
  savedLocallyOnly: 'Saved locally (server unreachable)',
  wordsCount: '{0} [word|words]',
  wordsEmpty: 'No saved words yet',
  nothingFound: 'Nothing found',
  deleteTitle: 'Delete',
  errorWithText: 'Error: {0}',
  noResponse: 'no response',

  dashTitle: 'Stats and history',
  dashLoginPrompt: 'Sign in from the extension to see your stats and translation history.',
  totalTranslationsLabel: 'Translations in period',
  totalWordsLabel: 'Words saved',
  activeDaysLabel: 'Active days',
  bestStreakLabel: 'Longest streak',
  cardReview: 'Review',
  cardFrequent: 'You keep looking this up',
  frequentNote: 'Words you translated several times but never saved.',
  cardActivity: 'Activity',
  days7: '7 days',
  days30: '30 days',
  days90: '90 days',
  seriesAll: 'All',
  seriesTranslations: 'Translations',
  seriesWords: 'Words',
  seriesWordsFull: 'Saved words',
  chartAria: 'Activity chart for the selected period',
  cardHistory: 'Translation history',
  historySearchPlaceholder: 'Search by word or translation…',
  prevPage: '← Newer',
  nextPage: 'Older →',
  historyNote: 'History is kept for 90 days and then deleted automatically.',
  historyLoadFailed: 'Could not load the history',
  historyEmpty: 'History is empty — translate a word in a video and it will show up here',
  pageInfo: 'Page {0} of {1} · {2} [entry|entries]',
  modeWord: 'word',
  modePhrase: 'phrase',
  modeSentence: 'sentence',
  toVideo: 'To the video',

  reviewLoadFailed: 'Could not load the cards',
  reviewDone: 'Done — {0} [word|words] reviewed. Come back tomorrow.',
  reviewEmpty: 'Nothing to review. Save a few words in a video and they will appear here.',
  reviewProgress: '{0} of {1}',
  showTranslation: 'Show the translation',
  whereIMetIt: 'Where I met it →',
  gradeAgain: 'Blanked',
  gradeAgainHint: 'again today',
  gradeHard: 'Hard',
  gradeHardHint: 'soon',
  gradeGood: 'Got it',
  gradeGoodHint: 'on schedule',
  gradeEasy: 'Easy',
  gradeEasyHint: 'much later',
  gradeSaveFailed: 'Could not save the grade — try reloading the page',
  freqSave: 'Save',
  freqSaving: 'Saving…',
  freqFailed: 'Failed',

  apiKeyMissing: 'No API key configured. Click the extension icon.',
  requestTimeout: 'Gemini did not answer within {0}s. Try again.',
  rateLimited: 'Gemini request limit exceeded. Wait a moment and try again.',
  overloaded: 'Gemini is temporarily unavailable (overloaded). Try again later.',
  modelNotFound: 'Model "{0}" not found. Check the model name in the settings.',
  genericApiError: 'Gemini API {0}: {1}',
  emptyResponse: 'Empty response from Gemini',
  backendRejectedLogin: 'The server rejected the sign-in ({0})',
  translateFailed: 'Translation error ({0})',
  googleNoIdToken: 'Google returned no id_token',

  modelHintFastest: 'Fastest and cheapest — the usual pick',
  modelHintBalanced: 'Balance of speed and quality',
  modelHintAccurate: 'Most accurate — for difficult dialogue',
  modelHintLegacy: 'Cheaper, previous generation',
  langEnglish: 'English',
  langSpanish: 'Spanish',
  langFrench: 'French',
  langGerman: 'German',
  langPolish: 'Polish',
  langItalian: 'Italian',
  langUkrainian: 'Ukrainian'
};

const PL: Record<MessageKey, string> = {
  loadButtonIdle: 'Wczytaj SRT',
  loadButtonLoaded: '{0} [napis|napisy|napisów]',
  parseError: 'Nie udało się przetworzyć napisów. Sprawdź, czy to prawidłowy plik .srt/.vtt.',
  fileReadError: 'Błąd odczytu pliku: {0}',
  fileTooLarge: 'Plik jest za duży ({0} MB). Maksimum to 5 MB.',
  videoNotFound: 'Nie znaleziono odtwarzacza wideo na tej stronie',
  offsetIndicator: 'Przesunięcie: {0}s  ([ ] zmiana, \\ — reset)',
  subtitlesUnavailable: 'Napisy są niedostępne dla tego filmu',
  subtitlesLoadError: 'Nie udało się wczytać napisów',
  subtitleFallbackLanguage: 'Pokazano napisy w języku "{0}" — wybrany język jest niedostępny dla tego filmu',

  translating: 'Tłumaczę...',
  tooltipAriaLabel: 'Tłumaczenie',
  saveWord: '⭐ Zapisz',
  speakWord: '🔊',
  speakWordTitle: 'Posłuchaj wymowy',
  saveWordSaving: 'Zapisuję…',
  saveWordDone: '✓ Zapisano',
  saveWordFailed: '✕ Nie zapisano',
  close: 'Zamknij',
  phraseLabel: 'Fraza:',
  sentenceLabel: 'Wers:',

  replayedLine: '↻ Powtórka kwestii',
  autoPauseOn: '⏸ Autopauza włączona (A — wyłącz)',
  autoPauseOff: '▶ Autopauza wyłączona',

  difficultyEasy: 'Łatwe dla ciebie',
  difficultyGood: 'Dokładnie twój poziom',
  difficultyHard: 'Trochę trudne',
  difficultyVeryHard: 'Bardzo trudne',
  difficultyDetail: 'Znane słowa: {0} z {1}',

  pronounceListening: '🎤 Mów…',
  pronounceScore: 'Zgodność {0}%',
  pronounceHint: 'P — spróbuj ponownie',
  pronounceNoCue: 'Brak aktywnej kwestii do powtórzenia',
  pronounceUnsupported: 'Ta przeglądarka nie obsługuje rozpoznawania mowy',
  pronounceNoMic: 'Potrzebny dostęp do mikrofonu — przyznaj go w pasku adresu',
  pronounceNoSpeech: 'Nic nie usłyszałem — spróbuj ponownie',
  pronounceNetwork: 'Rozpoznawanie jest niedostępne bez internetu',
  pronounceFailed: 'Nie udało się rozpoznać mowy',

  settingsButtonLabel: 'Ustawienia tłumacza napisów',
  settingsPanelAriaLabel: 'Ustawienia tłumacza napisów',
  settingsApiKeyRequired: 'Wprowadź klucz API',
  settingsLoginRequired: 'Zaloguj się, aby użyć wbudowanego klucza',
  settingsSaved: '✓ Zapisano',
  labelGeminiKey: 'Klucz Gemini',
  keySourceOwn: 'Własny klucz',
  keySourceProxy: 'Wbudowany',
  labelSourceLang: 'Język napisów',
  labelTargetLang: 'Tłumacz na',
  labelModel: 'Model Gemini',
  labelUiLang: 'Język interfejsu',
  btnSave: 'Zapisz',
  proxyHintOk: 'Tłumaczenie idzie przez nasz serwer — własny klucz nie jest potrzebny.',
  proxyHintLoginRequired: 'Wymagane zalogowanie — wbudowany klucz działa tylko z kontem.',
  getKeyFree: 'Zdobądź bezpłatnie:',

  accountLoggedOut: 'Niezalogowany',
  accountLoggedIn: '{0}',
  accountLoginBtn: 'Zaloguj się przez Google',
  accountLogoutBtn: 'Wyloguj',
  accountBusy: '…',
  accountLoginFailed: 'Nie udało się zalogować',

  popupSubtitle: 'Tłumaczenie napisów przez AI',
  tabProfile: 'Profil',
  tabWords: 'Słowa',
  tabSettings: 'Ustawienia',
  profileLoginPrompt: 'Zaloguj się, aby synchronizować słowa i ustawienia między urządzeniami.',
  statWordsLabel: 'Słów',
  statWeekLabel: 'W tym tygodniu',
  statPairsLabel: 'Par językowych',
  openDashboard: 'Statystyki i historia',
  wordsLoginPrompt: 'Zaloguj się, aby zobaczyć zapisane słowa.',
  wordSearchPlaceholder: 'Szukaj słowa…',
  memberSince: 'W serwisie od {0}',
  quotaLeft: 'Wbudowany klucz: zostało {0} z {1} na dziś',
  quotaUnavailable: 'Wbudowany klucz jest teraz niedostępny — użyj własnego',
  savedLocallyOnly: 'Zapisano lokalnie (serwer nieosiągalny)',
  wordsCount: '{0} [słowo|słowa|słów]',
  wordsEmpty: 'Brak zapisanych słów',
  nothingFound: 'Nic nie znaleziono',
  deleteTitle: 'Usuń',
  errorWithText: 'Błąd: {0}',
  noResponse: 'brak odpowiedzi',

  dashTitle: 'Statystyki i historia',
  dashLoginPrompt: 'Zaloguj się w rozszerzeniu, aby zobaczyć statystyki i historię tłumaczeń.',
  totalTranslationsLabel: 'Tłumaczeń w okresie',
  totalWordsLabel: 'Zapisanych słów',
  activeDaysLabel: 'Aktywnych dni',
  bestStreakLabel: 'Najdłuższa seria',
  cardReview: 'Powtórki',
  cardFrequent: 'Ciągle tego szukasz',
  frequentNote: 'Słowa, które tłumaczyłeś kilka razy, ale nigdy nie zapisałeś.',
  cardActivity: 'Aktywność',
  days7: '7 dni',
  days30: '30 dni',
  days90: '90 dni',
  seriesAll: 'Wszystko',
  seriesTranslations: 'Tłumaczenia',
  seriesWords: 'Słowa',
  seriesWordsFull: 'Zapisane słowa',
  chartAria: 'Wykres aktywności w wybranym okresie',
  cardHistory: 'Historia tłumaczeń',
  historySearchPlaceholder: 'Szukaj po słowie lub tłumaczeniu…',
  prevPage: '← Nowsze',
  nextPage: 'Starsze →',
  historyNote: 'Historia jest przechowywana 90 dni, potem usuwana automatycznie.',
  historyLoadFailed: 'Nie udało się wczytać historii',
  historyEmpty: 'Historia jest pusta — przetłumacz słowo w filmie i pojawi się tutaj',
  pageInfo: 'Strona {0} z {1} · {2} [wpis|wpisy|wpisów]',
  modeWord: 'słowo',
  modePhrase: 'fraza',
  modeSentence: 'zdanie',
  toVideo: 'Do filmu',

  reviewLoadFailed: 'Nie udało się wczytać fiszek',
  reviewDone: 'Gotowe — powtórzono {0} [słowo|słowa|słów]. Wracaj jutro.',
  reviewEmpty: 'Nic do powtórzenia. Zapisz kilka słów w filmie i pojawią się tutaj.',
  reviewProgress: '{0} z {1}',
  showTranslation: 'Pokaż tłumaczenie',
  whereIMetIt: 'Gdzie to spotkałem →',
  gradeAgain: 'Nie pamiętam',
  gradeAgainHint: 'znów dziś',
  gradeHard: 'Trudne',
  gradeHardHint: 'wkrótce',
  gradeGood: 'Pamiętam',
  gradeGoodHint: 'zgodnie z planem',
  gradeEasy: 'Łatwe',
  gradeEasyHint: 'później',
  gradeSaveFailed: 'Nie udało się zapisać oceny — odśwież stronę',
  freqSave: 'Zapisz',
  freqSaving: 'Zapisuję…',
  freqFailed: 'Nie udało się',

  apiKeyMissing: 'Klucz API nie jest ustawiony. Kliknij ikonę rozszerzenia.',
  requestTimeout: 'Gemini nie odpowiedział w ciągu {0}s. Spróbuj ponownie.',
  rateLimited: 'Przekroczono limit zapytań do Gemini. Odczekaj chwilę i spróbuj ponownie.',
  overloaded: 'Gemini jest chwilowo niedostępny (przeciążony). Spróbuj później.',
  modelNotFound: 'Nie znaleziono modelu "{0}". Sprawdź nazwę modelu w ustawieniach.',
  genericApiError: 'Gemini API {0}: {1}',
  emptyResponse: 'Pusta odpowiedź od Gemini',
  backendRejectedLogin: 'Serwer odrzucił logowanie ({0})',
  translateFailed: 'Błąd tłumaczenia ({0})',
  googleNoIdToken: 'Google nie zwrócił id_token',

  modelHintFastest: 'Najszybszy i najtańszy — typowy wybór',
  modelHintBalanced: 'Równowaga szybkości i jakości',
  modelHintAccurate: 'Najdokładniejszy — do trudnych dialogów',
  modelHintLegacy: 'Tańszy, poprzednia generacja',
  langEnglish: 'angielski',
  langSpanish: 'hiszpański',
  langFrench: 'francuski',
  langGerman: 'niemiecki',
  langPolish: 'polski',
  langItalian: 'włoski',
  langUkrainian: 'ukraiński'
};

const DICTS: Record<Lang, Record<MessageKey, string>> = { uk: UK, en: EN, pl: PL };

// Теги локалі для Intl (дати в popup і дашборді). Без цього дата лишалася б
// українською навіть при англійському інтерфейсі.
const LOCALE_TAGS: Record<Lang, string> = { uk: 'uk-UA', en: 'en-US', pl: 'pl-PL' };

// ── Стан ─────────────────────────────────────────────────────────────────────
let current: Lang = FALLBACK;
const listeners = new Set<(lang: Lang) => void>();

export function getLang(): Lang {
  return current;
}

export function localeTag(): string {
  return LOCALE_TAGS[current];
}

export function isLang(value: unknown): value is Lang {
  return value === 'uk' || value === 'en' || value === 'pl';
}

// Мова браузера як стартове значення: користувач, який ще нічого не обирав,
// має побачити знайому мову, а не нашу улюблену. chrome.i18n.getUILanguage()
// віддає теги виду "uk", "en-US", "pl" — беремо частину до дефіса.
export function detectLang(): Lang {
  try {
    const tag = chrome.i18n?.getUILanguage?.() ?? navigator.language;
    const base = String(tag).toLowerCase().split('-')[0];
    return isLang(base) ? base : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  listeners.forEach((fn) => fn(lang));
}

// Підписка на зміну мови. Потрібна там, де текст уже намальований і сам себе
// не перемалює: статичні підписи в HTML, aria-label кнопки в плеєрі, готові
// дропдауни з підказками.
export function onLangChange(fn: (lang: Lang) => void): void {
  listeners.add(fn);
}

// Викликати ОДИН раз на старті кожного контексту (popup, дашборд,
// content-script, service worker) і дочекатися: до цього моменту MESSAGES
// віддає мову за замовчуванням, тож рендер до await показав би не те.
//
// Повторний виклик повертає той самий проміс — контексти на кшталт воркера
// можуть смикати його з кількох обробників без гонки.
let initPromise: Promise<Lang> | null = null;

export function initI18n(): Promise<Lang> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    let stored: unknown;
    try {
      const data = await chrome.storage.local.get(STORAGE.uiLang);
      stored = data[STORAGE.uiLang];
    } catch {
      stored = undefined;
    }
    current = isLang(stored) ? stored : detectLang();

    // Живий синк: мову змінили в popup — панель на сторінці й дашборд
    // дізнаються про це тим самим каналом, що й решта налаштувань.
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      const change = changes[STORAGE.uiLang];
      if (!change) return;
      const next = change.newValue;
      setLang(isLang(next) ? next : detectLang());
    });

    return current;
  })();

  return initPromise;
}

// ── Формування рядка ─────────────────────────────────────────────────────────
const PLACEHOLDER = /\{(\d+)\}/g;
const PLURAL = /\[([^\]]*\|[^\]]*)\]/g;

// Форми: слов'янські мови — три (1 / 2-4 / решта), англійська — дві.
// Правило вибирається за мовою, а кількість форм — за шаблоном, тому один і
// той самий ключ може мати дві форми в EN і три в UK/PL.
function pluralIndex(lang: Lang, n: number, forms: number): number {
  if (forms < 3 || lang === 'en') return n === 1 ? 0 : Math.min(1, forms - 1);

  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 0;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 1;
  return 2;
}

// Аргументи, які треба підготувати перед підстановкою. Тримати таке форматування
// в шаблоні неможливо (знак і кількість знаків після коми — це логіка, не текст),
// а робити його на місці виклику означало б повторити його в кожній мові.
const PRE: Partial<Record<MessageKey, (args: unknown[]) => unknown[]>> = {
  offsetIndicator: ([offset]) => {
    const value = Number(offset);
    return [`${value >= 0 ? '+' : ''}${value.toFixed(1)}`];
  }
};

// Форму множини визначає перший аргумент-ЧИСЛО. Саме число, без приведення
// рядків: у шаблоні на кшталт pageInfo число сторінки йде першим, а множину має
// задавати кількість записів — тож місце виклику передає номери рядками, і це
// працює лише за умови, що тут немає Number(...).
function firstNumber(args: unknown[]): number {
  for (const arg of args) {
    if (typeof arg === 'number' && Number.isFinite(arg)) return arg;
  }
  return 0;
}

function fill(template: string, args: unknown[], lang: Lang): string {
  const n = firstNumber(args);
  return template
    .replace(PLURAL, (_m, group: string) => {
      const forms = group.split('|');
      return forms[pluralIndex(lang, n, forms.length)] ?? forms[forms.length - 1];
    })
    .replace(PLACEHOLDER, (_m, index: string) => {
      const value = args[Number(index)];
      return value === undefined || value === null ? '' : String(value);
    });
}

function template(key: MessageKey): string {
  // Фолбек на UK, а не порожній рядок: неперекладений ключ гірший за ключ
  // чужою мовою, але обидва краще за пусте місце в інтерфейсі.
  return DICTS[current][key] ?? UK[key] ?? String(key);
}

// Пряме звернення до рядка — коли ключ обчислюється (`t(mode === 'word' ? ...)`)
// або коли явність важливіша за стислість.
export function t(key: MessageKey, ...args: unknown[]): string {
  const raw = template(key);
  const prepared = PRE[key] ? PRE[key]!(args) : args;
  return fill(raw, prepared, current);
}

// ── MESSAGES ─────────────────────────────────────────────────────────────────
// Той самий інтерфейс, що був до локалізації. Ключ із підстановкою або
// множиною віддається функцією, решта — рядком.
const NEEDS_ARGS = /\{\d+\}|\[[^\]]*\|/;

export const MESSAGES = new Proxy({} as Record<MessageKey, any>, {
  get(_target, key: string) {
    const messageKey = key as MessageKey;
    const raw = template(messageKey);
    if (!NEEDS_ARGS.test(raw)) return raw;
    return (...args: unknown[]) => t(messageKey, ...args);
  },

  // Без цього `key in MESSAGES` і Object.keys() бачили б порожній об'єкт.
  has(_target, key: string) {
    return key in UK;
  },
  ownKeys() {
    return Object.keys(UK);
  },
  getOwnPropertyDescriptor() {
    return { enumerable: true, configurable: true };
  }
});

// ── Статичні підписи в HTML ──────────────────────────────────────────────────
// popup.html і dashboard.html розмічені атрибутами замість текстів. Так підписи
// лишаються видимими в самому HTML (його читає і рецензент Web Store), а мова
// підставляється на старті й на кожній зміні.
export function applyStaticI18n(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n as MessageKey);
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-placeholder]').forEach((el) => {
    (el as HTMLInputElement).placeholder = t(el.dataset.i18nPlaceholder as MessageKey);
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle as MessageKey);
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria as MessageKey));
  });
}
