// Мінімальні амбієнтні типи для тієї підмножини chrome.* API, яку реально
// використовує розширення. Свідомо без @types/chrome — package.json має
// лишатися лише з typescript + esbuild у devDependencies (Фаза 1).

declare namespace chrome.storage {
  type StorageItems = Record<string, any>;

  interface StorageArea {
    get(keys?: string | string[] | StorageItems | null): Promise<StorageItems>;
    get(keys: string | string[] | StorageItems | null, callback: (items: StorageItems) => void): void;
    set(items: StorageItems): Promise<void>;
  }

  const local: StorageArea;
}

declare namespace chrome.runtime {
  const id: string;

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
