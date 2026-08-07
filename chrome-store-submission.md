# Chrome Web Store Submission

## Single purpose

Presto for Trello customizes Trello checklists: completed-item appearance (strikethrough, color, check icon), optional status badges, a denser card layout by hiding the comments panel, and a local clipboard for copying checklist items between cards.

## Storage permission justification

The storage permission is used exclusively for:

- **Sync preferences** (`chrome.storage.sync`): strikethrough, check-icon, hide-comments, completed-item color, and status badge settings (enabled state, active color pack, per-label color overrides)
- **Local clipboard tray** (`chrome.storage.local`): plain-text staged checklist item names for the Presto clipboard feature, so items can be pasted on another card in the same browser profile

Nothing is sold, shared with third parties, or sent to Presto/developer servers. Settings sync across the user’s own devices via Chrome sync; the clipboard tray stays local to the browser profile.

## Privacy practices (Chrome Web Store dashboard)

Use answers that match local handling — do **not** claim “no user data” if the form asks about storage:

- **Data collected / transmitted to a server:** No
- **Data stored locally:** Yes — preference settings (`chrome.storage.sync`) and staged checklist item text for the clipboard (`chrome.storage.local`)
- **Personally identifiable information:** No (checklist item text may be whatever the user typed in Trello; it is not used for identity and is not transmitted)
- **Remote code / analytics / advertising:** No
- **Purpose of storage:** Provide extension functionality only (remember settings; stage items for paste between cards)

## Host permission justification

The host permission is required to run content scripts on Trello board pages. Those scripts apply visual checklist customisations and drive the Presto clipboard UI (copy/paste controls and toasts) on `trello.com`. Without access to trello.com the extension cannot apply any changes.
