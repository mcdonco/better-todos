# Better Todos for Trello — Chrome Extension

A Chrome extension that improves the Trello checklist experience. Customise completed items: remove strikethrough, change text colour, and add a check icon.

[mcdon.co/better-todos](https://mcdon.co/better-todos)

## Features

- **Remove strikethrough** — completed items stay readable instead of struck out
- **Colour customisation** — highlight done items with a preset or custom colour
- **Check icon** — optional ✓ suffix appended to completed items
- **Instant apply** — settings take effect on Trello immediately, no page reload needed

## How it works

A content script runs on `trello.com` and injects a small stylesheet that overrides Trello's default completed checklist item styles. User preferences (strikethrough toggle, colour, check icon toggle) are stored in `chrome.storage.sync` via the extension popup.

## Project structure

```
extension/
├── manifest.json       # Chrome extension manifest (MV3)
├── content.js          # Injects styles into Trello board pages
├── popup.html          # Extension popup UI
├── popup.js            # Popup logic — reads/writes chrome.storage.sync
├── content.css         # Base content styles
└── icons/              # Extension icons (16, 48, 128, 144px)
```

## Loading locally

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `extension/` folder
4. Open a Trello board — the extension is active immediately

## Adjusting selectors

If Trello updates its class names, inspect a completed checklist item in DevTools and update the selectors in `content.js` accordingly.

## Privacy

No user data is collected or transmitted. See the full privacy policy at [mcdon.co/better-todos/privacy](https://mcdon.co/better-todos/privacy).
