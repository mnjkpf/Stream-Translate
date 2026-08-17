// Мінімальні амбієнтні типи для тієї підмножини chrome.* API, яку реально
// використовує розширення. Свідомо без @types/chrome — package.json має
// лишатися лише з typescript + esbuild у devDependencies (Фаза 1).

declare namespace chrome.storage {
  type StorageItems = Record<string, any>;

  interface StorageArea {
    get(keys?: string | string[] | StorageItems | null): Promise<StorageItems>;
    get(keys: string | string[] | StorageItems | null, callback: (items: StorageItems) => void): void;
    set(items: StorageItems): Promise<void>;
    remove(keys: string | string[]): Promise<void>;
  }

  const local: StorageArea;

  interface StorageChange {
    oldValue?: any;
    newValue?: any;
  }

  // Основа "живого" синку: будь-яка зміна storage розсилається в УСІ контексти
  // розширення (content-script, popup, service worker) без перезавантаження
  // сторінки. Через це storage і є нашою шиною подій — див. shared/messages.ts.
  const onChanged: {
    addListener(callback: (changes: Record<string, StorageChange>, areaName: string) => void): void;
  };
}

declare namespace chrome.i18n {
  // Мова інтерфейсу БРАУЗЕРА (теги виду "uk", "en-US"). Використовується лише
  // як стартове значення, поки користувач не обрав мову сам — переписати її
  // через цей API неможливо, тому власний вибір живе в storage (STORAGE.uiLang).
  // Доступний без жодного дозволу в manifest і в усіх контекстах розширення.
  function getUILanguage(): string;
}

declare namespace chrome.identity {
  // Повертає https://<extension-id>.chromiumapp.org/<path> — цей URL реєструється
  // як Authorized redirect URI в Google Cloud Console OAuth-клієнті.
  function getRedirectURL(path?: string): string;

  // Відкриває керований Chrome попап OAuth-провайдера і резолвиться повним
  // redirect-URL (з id_token у фрагменті) після успіху.
  function launchWebAuthFlow(details: { url: string; interactive?: boolean }): Promise<string>;
}

declare namespace chrome.tabs {
  // create() не потребує дозволу "tabs" — той дає доступ до вмісту вкладок,
  // а не до їх відкриття. Тому в manifest нічого додавати не треба.
  function create(properties: { url: string; active?: boolean }): Promise<any>;
}

declare namespace chrome.runtime {
  const id: string;

  // Повний URL до файлу всередині розширення (chrome-extension://<id>/...).
  function getURL(path: string): string;

  function sendMessage(message: unknown): Promise<any>;

  interface MessageSender {
    id?: string;
  }

  const onMessage: {
    addListener(
      callback: (message: any, sender: MessageSender, sendResponse: (response?: any) => void) => void | boolean
    ): void;
  };
}
