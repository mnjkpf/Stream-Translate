// Subtitle Translator — інтерфейс адаптера сайту
// Уся платформо-специфічна логіка (пошук відео, точка монтування,
// fullscreen-корінь, джерело субтитрів) ховається за цим інтерфейсом. Решта
// коду (ui.ts, subtitles.ts, sync.ts, ...) платформо-незалежна й працює
// лише через нього.
//
// Щоб додати нову платформу: реалізувати SiteAdapter у новому файлі
// (напр. netflixAdapter.ts) і додати його в SITE_ADAPTERS (siteAdapters.ts)
// та у content_scripts.matches у manifest.json.

import type { Cue } from '../subtitles/subtitleParser';

export interface SubtitleFetchResult {
  cues: Cue[];
  state: 'ok' | 'noCaptions' | 'loadFailed';
  languageCode: string | null;
  isFallbackLanguage: boolean;
  isAsr: boolean;
}

export interface SubtitleSource {
  fetchCues(): Promise<SubtitleFetchResult>;
}

export interface SiteAdapter {
  id: string;
  hosts: string[];

  matchesHost(host: string): boolean;
  findVideo(): HTMLVideoElement | null;
  getMountPoint(video: HTMLVideoElement): Element | null;
  getFullscreenRoot(video: HTMLVideoElement): Element | null;

  // null — сайт не постачає субтитри сам, лишається кнопка + ручний SRT/VTT
  getSubtitleSource(): SubtitleSource | null;

  // Опційні хуки — не кожен сайт їх потребує/реалізує
  observeNavigation?(callback: () => void): void;
  hideNativeSubtitles?(): void;
  showNativeSubtitles?(): void;
  startCaptionFallback?(onLineChange: (text: string) => void): (() => void) | null;
  placeSettingsButton?(buttonEl: HTMLElement): boolean;
}
