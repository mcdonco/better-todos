# Presto for Trello — Chrome Extension

A Chrome extension that improves the Trello checklist experience.

[mcdon.co/presto](https://mcdon.co/presto)

Trello marks completed checklist items with a strikethrough by default — but once something's done, you don't need a line through it to know that.

Presto for Trello lets you take back control of how completed items look. Remove the strikethrough, pick a colour that signals completion at a glance, and optionally add a ✓ icon to make done items pop. You can also add colour-coded status badges to any item, hide the comments panel to give checklists more room, and apply badges directly from the item editor — a badge picker appears between the text field and the action buttons when editing.

## Features

- Remove strikethrough — completed items stay readable instead of struck out
- Completed item colour — highlight done items with a preset or custom colour (green, grey, blue, or any hex)
- Check icon — optional ✓ suffix appended to completed items
- Hide comments panel — collapse the activity/comments aside to give checklists full width
- Status badges — add `[label]` to any checklist item text to render a colour-coded badge inline (e.g. `Fix login bug [blocked]`). Users without the extension see the original text with brackets intact.
  - Three built-in badge packs: QA (done/feedback/blocked/review), Agile (todo/in-progress/done/blocked), Opinion (yes/no/maybe)
  - Per-chip colour overrides with reset
  - Toggle between colour badges and grey badges without losing colour settings
  - Click-to-apply badge picker appears inline when editing a checklist item
- Instant apply — all settings take effect on Trello immediately, no page reload needed

## How it works

A content script (`content.js`) runs on `trello.com` and:

1. Injects a user-controlled `<style>` tag for completed-item overrides (strikethrough, colour, check icon, hide-comments layout fixes)
2. Walks checklist item text nodes and replaces `[label]` tokens with styled `<span>` chip elements
3. Watches for DOM changes via a `MutationObserver` (debounced 150 ms) to process dynamically loaded items
4. Injects a chip picker row into the checklist item edit form so badges can be applied without typing

Static chip styles (`.pt-chip`, `.pt-chip-row`, etc.) live in `content.css` and are injected by the manifest. Dynamic rules (colour, strikethrough, hide-comments) are built per-setting in JS and written to the `<style>` tag.

All preferences are stored in `chrome.storage.sync` and applied immediately when changed.

## Project structure

```
extension/
├── manifest.json       # Chrome extension manifest (MV3)
├── content.js          # Content script — styles, chip rendering, MutationObserver
├── content.css         # Static chip styles injected by manifest
├── chips.json          # Badge pack definitions (labels + default colours)
├── popup.html          # Extension popup UI (main view + badges sub-view)
├── popup.js            # Popup logic — reads/writes chrome.storage.sync
├── popup.css           # Popup styles
└── icons/              # Extension icons (16, 48, 128, 144 px)
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

If Trello updates its markup, inspect a checklist item in DevTools and update the `SELECTOR_*` constants at the top of `content.js`.

## Privacy

No user data is collected or transmitted. See the full privacy policy at [mcdon.co/presto/privacy](https://mcdon.co/presto/privacy).
