# Stream Translate

Interactive subtitles with AI-powered translation (Google Gemini) for streaming services.  
Public build: **YouTube** (Netflix and other platforms coming later).

## Features
- Click a word to translate it; drag to translate a phrase.
- Automatic detection of native YouTube subtitles (manual + auto-generated/ASR), with a DOM-based fallback.
- Settings button directly in the player, plus a popup. The Gemini API key is stored locally in the browser.

## Branches
- `develope` — development branch.
- `main` — release branch (empty until the first release).

## Local Setup
Open `chrome://extensions` → enable **Developer mode** → click **Load unpacked** → select this folder.

Enter your Gemini API key in the extension settings.
