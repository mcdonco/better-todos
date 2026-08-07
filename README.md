# Presto for Trello — Chrome Extension

A Chrome extension that improves the Trello checklist experience.

[mcdon.co/presto](https://mcdon.co/presto)

Trello marks completed checklist items with a strikethrough by default — but once something's done, you don't need a line through it to know that.

Presto for Trello lets you take back control of how completed items look. Remove the strikethrough, pick a color that signals completion at a glance, and optionally add a ✓ icon to make done items pop. You can also add color-coded status badges, hide the comments panel to give checklists more room, and copy checklist items between cards with a Presto clipboard.

## Features

- Remove strikethrough — completed items stay readable instead of struck out
- Completed item color — highlight done items with a preset or custom color (green, gray, blue, or any hex)
- Check icon — optional ✓ suffix appended to completed items
- Hide comments panel — collapse the activity/comments aside to give checklists full width
- Status badges — add `[label]` to any checklist item text to render a color-coded badge inline (e.g. `Fix login bug [blocked]`). Users without the extension see the original text with brackets intact.
  - Three built-in badge packs: QA (done/feedback/blocked/review), Agile (todo/in-progress/done/blocked), Opinion (yes/no/maybe)
  - Per-chip color overrides with reset
  - Toggle between color badges and gray badges without losing color settings
  - Click-to-apply badge picker appears inline when editing a checklist item
- Presto clipboard — cherry-pick checklist items on one card and paste them onto another
  - Hover a checklist item and click the copy icon to stage it
  - Toasts show a persistent item count (with Clear) plus a brief “Copied” confirmation
  - **Paste (N)** appears next to “Add an item” on checklists when the clipboard has items
  - Paste uses Trello’s multi-line add-item behaviour (one submit for the whole tray)
  - Popup **Clipboard** tab lists staged items and can clear them
- Instant apply — all settings take effect on Trello immediately, no page reload needed

## How it works

Content scripts run on `trello.com`:

1. **`content.js`** — completed-item styles (via a `.pt-completed` class, not expensive `:has()` selectors), status badge chips, and the inline badge picker
2. **`staging.js`** — Presto clipboard: copy controls, paste button, storage tray, paste runner
3. **`toast.js`** — stacked toasts (sticky clipboard count on top, flash messages beneath)
4. **`dom-bus.js`** — shared MutationObserver scoped to the open card (idle on the board)

Preferences live in `chrome.storage.sync`. Staged clipboard items live in `chrome.storage.local` (`prestoStagedItems`).

The popup has **Settings** and **Clipboard** tabs. Status badge pack/color UI loads only when you open that screen.

## Project structure

```
extension/
├── manifest.json         # Chrome extension manifest (MV3)
├── dom-bus.js            # Shared card-scoped MutationObserver
├── content.js            # Styles, chips, completed-class sync
├── content.css           # Chip + layout helper styles
├── staging.js            # Clipboard copy / paste feature
├── staging.css           # Copy / paste control styles
├── toast.js              # Toast stack API (PrestoToast)
├── toast.css             # Toast styles
├── chips.json            # Badge pack definitions
├── popup.html            # Popup UI (Settings + Clipboard tabs)
├── popup.js              # Settings / badges popup logic
├── popup-staging.js      # Clipboard tab (staged items list)
├── popup.css             # Popup styles
├── assets/icon.svg       # Optional brand asset
└── icons/                # Extension icons (16, 48, 128, 144 px)
```

## Loading locally

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `extension/` folder
4. Open a Trello board — the extension is active immediately

After any code change, click the **refresh** ↺ icon on the extension card, then hard-refresh the Trello tab (Cmd+Shift+R) to load the updated content script.

## Adding badge packs

Edit `chips.json` and add a new entry to the `packs` array:

```json
{
  "id": "my-pack",
  "name": "My Pack",
  "chips": [
    { "label": "urgent", "color": "#f87171" },
    { "label": "waiting", "color": "#facc15" }
  ]
}
```

## Adjusting selectors

If Trello updates its markup, inspect a checklist item in DevTools and update the `SELECTOR_*` / `data-testid` constants in `content.js` and `staging.js`.

## Privacy

Nothing is collected or transmitted to Presto servers. Preferences sync via Chrome sync; staged clipboard item text stays in local browser storage until cleared. See the full privacy policy at [mcdon.co/presto/privacy](https://mcdon.co/presto/privacy).
