# Chrome Web Store Submission

## Single purpose

Presto for Trello customises the appearance of completed checklist items on Trello boards. It removes strikethrough styling from checked items, lets the user choose a highlight colour for completed text, and optionally appends a check icon — making finished tasks easier to read at a glance.

## Storage permission justification

The storage permission is used exclusively to save user preferences: the strikethrough toggle, the check-icon toggle, the hide-comments toggle, the chosen highlight colour, and status badge settings (enabled state, active colour pack, and any per-label colour overrides). Settings are written to chrome.storage.sync so they persist across sessions and sync across the user's own devices. No personal data is stored.

## Host permission justification

The host permission is required to run a content script on Trello board pages. The content script injects a small stylesheet that overrides Trello's default completed checklist item styles according to the user's saved preferences. Without access to trello.com the extension cannot apply any visual changes.
