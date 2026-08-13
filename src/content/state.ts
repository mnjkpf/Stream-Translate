// Subtitle Translator — спільний стан content-script модулів
// Раніше жив на window.__subtr.state (класичні скрипти без спільної
// лексичної області між файлами); тепер — звичайний імпортований singleton,
// esbuild бандлить усе в один content-script.

import type { Cue } from './subtitles/subtitleParser';

export interface AppState {
  video: HTMLVideoElement | null;
  cues: Cue[];
  currentCue: Cue | null;
  offset: number;
  container: HTMLElement | null;
  tooltip: HTMLElement | null;
  loadBtn: HTMLButtonElement | null;
  offsetIndicator: HTMLElement | null;
  toast: HTMLElement | null;
  selecting: boolean;
  fileInput: HTMLInputElement | null;
  pausedByTooltip: boolean;
}

export const state: AppState = {
  video: null,           // <video> елемент
  cues: [],               // [{start, end, text}]
  currentCue: null,       // активний субтитр
  offset: 0,               // зсув у секундах
  container: null,        // div з субтитрами
  tooltip: null,           // tooltip
  loadBtn: null,           // кнопка завантаження
  offsetIndicator: null,  // індикатор зсуву
  toast: null,             // L-8: сповіщення замість alert()
  selecting: false,        // чи зараз виділяється фраза
  fileInput: null,
  pausedByTooltip: false  // чи поставили на паузу через tooltip
};
