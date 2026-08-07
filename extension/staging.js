(() => {
    'use strict';

    const STORAGE_KEY = 'prestoStagedItems';
    const CLASS_ALREADY_STAGED = 'pt-already-staged';
    const SCAN_DEBOUNCE_MS = 350;
    const PASTE_SETTLE_MS = 700;
    const PASTE_TIMEOUT_MS = 8000;

    function showToast(message) {
        globalThis.PrestoToast?.show(message);
    }

    function clearClipboard() {
        return setTray([]).then(() => {
            syncUi();
        });
    }

    function updateClipboardToast() {
        if (pasting) return;
        const toast = globalThis.PrestoToast;
        if (!toast) return;

        if (tray.length === 0) {
            if (toast.dismissSticky) toast.dismissSticky();
            else toast.hide?.();
            return;
        }

        const n = tray.length;
        toast.show(
            n === 1
                ? '1 item in Presto clipboard'
                : `${n} items in Presto clipboard`,
            {
                persistent: true,
                onClear: () => {
                    clearClipboard();
                },
            },
        );
    }

    /** Run DOM writes with injecting=true so the observer ignores our own mutations. */
    function withInjecting(fn) {
        injecting = true;
        try {
            fn();
        } finally {
            queueMicrotask(() => {
                injecting = false;
            });
        }
    }

    const SELECTOR_ITEM = '[data-testid="check-item-container"]';
    const SELECTOR_ITEM_NAME = '[data-testid="check-item-name"]';
    const SELECTOR_ITEM_EDITOR = '[data-testid="check-item-editor"]';
    const SELECTOR_CHECKLIST =
        '[data-testid="checklist-section"], [data-testid="checklist-container"]';

    const nativeTextareaSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
    )?.set;
    const nativeInputSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
    )?.set;

    /** @type {string[]} */
    let tray = [];
    /** @type {Set<string>} */
    let traySet = new Set();
    let debounceTimer = 0;
    let syncTimer = 0;
    let pasting = false;
    let injecting = false;
    let lastPasteCount = -1;
    /** @type {Element[]} */
    let pendingScanItems = [];
    let pendingFullScan = false;
    let pendingPasteScan = false;
    /** @type {Element | null} */
    let copySvgTemplate = null;

    function isCardContext() {
        return (
            globalThis.PrestoDom?.isCardContext?.() ??
            /\/c\//.test(location.pathname)
        );
    }

    function cardRoot() {
        return (
            globalThis.PrestoDom?.cardRoot?.() ||
            document.querySelector(
                '[data-testid="card-back-wrapper"], [data-testid="card-back"]',
            ) ||
            document.querySelector('[role="dialog"]') ||
            document
        );
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    function getTray() {
        return new Promise((resolve) => {
            chrome.storage.local.get({ [STORAGE_KEY]: [] }, (data) => {
                resolve(
                    Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [],
                );
            });
        });
    }

    function setTray(items) {
        tray = items.slice();
        traySet = new Set(tray);
        return new Promise((resolve) => {
            chrome.storage.local.set({ [STORAGE_KEY]: tray }, resolve);
        });
    }

    function adoptTray(items) {
        tray = Array.isArray(items) ? items.slice() : [];
        traySet = new Set(tray);
    }

    // ─── Item text ────────────────────────────────────────────────────────────

    function walkItemText(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            return node.nodeValue || '';
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return '';

        // Never include Presto UI chrome in item text
        if (
            node.classList?.contains('pt-copy-btn') ||
            node.classList?.contains('pt-paste-btn') ||
            node.classList?.contains('pt-clear-clipboard-btn') ||
            node.classList?.contains('pt-clipboard-actions')
        ) {
            return '';
        }

        // Presto status badges → restore [label]
        if (node.hasAttribute?.('data-pt-chip')) {
            return `[${node.getAttribute('data-pt-chip')}]`;
        }

        // Trello auto-links: keep the real URL from href when text is truncated
        if (node.tagName === 'A') {
            const href = node.getAttribute('href') || '';
            const text = (node.textContent || '').trim();
            if (/^https?:\/\//i.test(href)) {
                if (/^https?:\/\//i.test(text)) return text;
                try {
                    return decodeURI(href);
                } catch {
                    return href;
                }
            }
            return text;
        }

        let out = '';
        for (const child of node.childNodes) {
            out += walkItemText(child);
        }
        return out;
    }

    function getItemText(container) {
        const name = container.querySelector(SELECTOR_ITEM_NAME);
        if (!name) return '';
        // walkItemText already skips Presto chrome — no clone needed
        return walkItemText(name).replace(/\s+/g, ' ').trim();
    }

    // ─── Copy control ─────────────────────────────────────────────────────────

    function clipboardSvg() {
        if (!copySvgTemplate) {
            const ns = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(ns, 'svg');
            svg.setAttribute('width', '14');
            svg.setAttribute('height', '14');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('fill', 'none');
            svg.setAttribute('stroke', 'currentColor');
            svg.setAttribute('stroke-width', '2');
            svg.setAttribute('stroke-linecap', 'round');
            svg.setAttribute('stroke-linejoin', 'round');
            svg.setAttribute('aria-hidden', 'true');
            const rect = document.createElementNS(ns, 'rect');
            rect.setAttribute('x', '9');
            rect.setAttribute('y', '9');
            rect.setAttribute('width', '13');
            rect.setAttribute('height', '13');
            rect.setAttribute('rx', '2');
            const path = document.createElementNS(ns, 'path');
            path.setAttribute(
                'd',
                'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
            );
            svg.appendChild(rect);
            svg.appendChild(path);
            copySvgTemplate = svg;
        }
        return copySvgTemplate.cloneNode(true);
    }

    async function copyItem(container) {
        const text = getItemText(container);
        if (!text) {
            showToast('Could not read checklist item');
            return;
        }
        const next = tray.concat(text);
        await setTray(next);
        // Sticky clipboard state, then brief "Copied" flash (toast restores sticky)
        updateClipboardToast();
        showToast('Copied');
        updateStagedHighlight(container);
        updatePasteButtons();
        // Don't leave the copy control focused (keeps hover UI stuck visible)
        if (document.activeElement?.classList?.contains('pt-copy-btn')) {
            document.activeElement.blur();
        }
    }

    /** Trello's right-side action toolbar — prefer hover-buttons; no full button scan. */
    function findActionsHost(container) {
        const hoverBtns = container.querySelector(
            '[data-testid="check-item-hover-buttons"]',
        );
        if (hoverBtns) return hoverBtns;

        // Cheap known-button fallbacks only (hover toolbar may not be mounted yet)
        const due = container.querySelector(
            '[data-testid="check-item-set-due-button"]',
        );
        if (due?.parentElement) return due.parentElement;

        const member = container.querySelector(
            '[data-testid="check-item-assignee"], [data-testid="check-item-set-member-button"], [data-testid="check-item-add-member-button"]',
        );
        if (member?.parentElement) return member.parentElement;

        const overflow = container.querySelector(
            '[data-testid="checklist-item-overflow-menu-button"], [data-testid="check-item-overflow-menu-trigger"]',
        );
        if (overflow?.parentElement) return overflow.parentElement;

        // Retry on next hover once Trello mounts hover-buttons
        return null;
    }

    function makeCopyButton() {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pt-copy-btn';
        btn.title = 'Copy to Presto';
        btn.setAttribute('aria-label', 'Copy to Presto');
        btn.appendChild(clipboardSvg());
        return btn;
    }

    function isItemStaged(container) {
        if (!traySet.size) return false;
        const text = getItemText(container);
        return !!(text && traySet.has(text));
    }

    function updateStagedHighlight(container) {
        const staged = isItemStaged(container);
        const was = container.classList.contains(CLASS_ALREADY_STAGED);
        if (staged !== was) {
            container.classList.toggle(CLASS_ALREADY_STAGED, staged);
        }
    }

    function injectCopyControl(container, { highlight = true } = {}) {
        if (!(container instanceof Element)) return;
        if (container.closest(SELECTOR_ITEM_EDITOR)) return;
        if (container.querySelector(SELECTOR_ITEM_EDITOR)) return;
        if (!container.querySelector(SELECTOR_ITEM_NAME)) return;

        if (highlight) updateStagedHighlight(container);

        const existing = container.querySelector('.pt-copy-btn');
        if (existing?.isConnected) {
            // Already in the hover toolbar — nothing to do
            if (existing.closest('[data-testid="check-item-hover-buttons"]')) {
                return;
            }
            const host = findActionsHost(container);
            if (host && existing.parentElement !== host) {
                withInjecting(() => host.appendChild(existing));
            }
            return;
        }

        const host = findActionsHost(container);
        if (!host) return;

        withInjecting(() => {
            host.appendChild(makeCopyButton());
        });
    }

    function refreshAlreadyStagedHints(scope) {
        const root = scope || cardRoot();
        // Fast path: nothing staged and nothing highlighted
        if (!traySet.size) {
            root
                .querySelectorAll?.(`.${CLASS_ALREADY_STAGED}`)
                ?.forEach((el) => el.classList.remove(CLASS_ALREADY_STAGED));
            return;
        }
        root.querySelectorAll?.(SELECTOR_ITEM)?.forEach((container) => {
            updateStagedHighlight(container);
        });
    }

    // ─── Paste control ────────────────────────────────────────────────────────

    function findAddItemField(checklist) {
        // Prefer stable testids first (cheapest + most reliable)
        const byTestId =
            checklist.querySelector(
                '[data-testid="check-item-text-input"], [data-testid="checklist-add-item"] textarea, [data-testid="checklist-add-item"] input',
            ) || null;
        if (byTestId) return byTestId;

        const selectors = [
            'textarea[placeholder*="Add an item" i]',
            'input[placeholder*="Add an item" i]',
            'textarea[placeholder*="Add item" i]',
            'input[placeholder*="Add item" i]',
        ];
        for (const sel of selectors) {
            try {
                const el = checklist.querySelector(sel);
                if (el) return el;
            } catch {
                /* invalid selector in older engines */
            }
        }

        const fields = checklist.querySelectorAll('textarea, input[type="text"]');
        for (const el of fields) {
            const ph = (el.getAttribute('placeholder') || '').toLowerCase();
            if (ph.includes('add an item') || ph.includes('add item')) return el;
        }

        const textareas = [...fields].filter((el) => el.tagName === 'TEXTAREA');
        if (textareas.length) return textareas[textareas.length - 1];
        return null;
    }

    function findAddItemTrigger(checklist) {
        const candidates = checklist.querySelectorAll(
            'button, a, [role="button"]',
        );
        for (const el of candidates) {
            if (
                el.classList.contains('pt-paste-btn') ||
                el.classList.contains('pt-clear-clipboard-btn')
            ) {
                continue;
            }
            const t = (el.textContent || '').trim();
            if (/^add an item$/i.test(t) || /^add item$/i.test(t)) return el;
        }
        return null;
    }

    function sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }

    async function ensureAddItemField(checklist) {
        let field = findAddItemField(checklist);
        if (field) return field;

        const trigger = findAddItemTrigger(checklist);
        if (trigger) {
            trigger.click();
            await sleep(250);
            field = findAddItemField(checklist);
        }
        return field;
    }

    function setFieldValue(field, value) {
        if (field instanceof HTMLTextAreaElement && nativeTextareaSetter) {
            nativeTextareaSetter.call(field, value);
        } else if (field instanceof HTMLInputElement && nativeInputSetter) {
            nativeInputSetter.call(field, value);
        } else {
            field.value = value;
        }
        // input only — never dispatch change (Trello can treat it as a commit)
        field.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function countChecklistItems(checklist) {
        return checklist.querySelectorAll(SELECTOR_ITEM).length;
    }

    function findComposerAddButton(field) {
        const root =
            field.closest('form') ||
            field.closest('[data-testid="checklist-add-item"]') ||
            field.parentElement;
        if (!root) return null;

        const buttons = [...root.querySelectorAll('button')];
        return (
            buttons.find((b) => {
                if (
                    b.classList.contains('pt-paste-btn') ||
                    b.classList.contains('pt-clear-clipboard-btn')
                ) {
                    return false;
                }
                if (b.disabled) return false;
                const t = (b.textContent || '').trim();
                return /^add$/i.test(t);
            }) ||
            buttons.find((b) => {
                if (
                    b.classList.contains('pt-paste-btn') ||
                    b.classList.contains('pt-clear-clipboard-btn')
                ) {
                    return false;
                }
                return b.type === 'submit';
            }) ||
            null
        );
    }

    /** Commit via Add button click only — Enter was double-firing in Trello. */
    function submitComposer(field) {
        field.focus();
        const addBtn = findComposerAddButton(field);
        if (addBtn) {
            addBtn.click();
            return 'click';
        }

        // Fallback: Enter, but block the browser's default form-submit
        const blockDefault = (e) => {
            if (e.key === 'Enter') e.preventDefault();
        };
        field.addEventListener('keydown', blockDefault, {
            capture: true,
            once: true,
        });
        field.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true,
            }),
        );
        return 'enter';
    }

    /**
     * Wait until checklist grows by `expected` items, or growth settles.
     * Uses a short MutationObserver instead of a tight poll loop.
     */
    function waitForItemsAdded(checklist, countBefore, expected, timeoutMs) {
        return new Promise((resolve) => {
            let last = countChecklistItems(checklist);
            let settleTimer = 0;
            let done = false;

            const finish = (added) => {
                if (done) return;
                done = true;
                clearTimeout(timeoutId);
                clearTimeout(settleTimer);
                observer.disconnect();
                resolve(Math.max(0, added));
            };

            const check = () => {
                const n = countChecklistItems(checklist);
                const added = n - countBefore;
                if (added >= expected) {
                    finish(added);
                    return;
                }
                if (n > last) {
                    last = n;
                    clearTimeout(settleTimer);
                    settleTimer = setTimeout(() => {
                        finish(countChecklistItems(checklist) - countBefore);
                    }, PASTE_SETTLE_MS);
                }
            };

            const observer = new MutationObserver(check);
            observer.observe(checklist, { childList: true, subtree: true });

            const timeoutId = setTimeout(() => {
                finish(countChecklistItems(checklist) - countBefore);
            }, timeoutMs);

            // In case items already landed synchronously
            check();
        });
    }

    /** One staged item → one Trello line (collapse embedded newlines). */
    function toPasteLine(text) {
        return String(text || '')
            .replace(/\s*\n+\s*/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Paste all staged items in one shot — Trello splits newline-separated
     * text in the Add an item field into separate checklist items.
     */
    async function pasteIntoChecklist(checklist) {
        if (pasting) return;

        const items = tray.slice();
        if (!items.length) return;

        const lines = items.map(toPasteLine).filter(Boolean);
        if (!lines.length) return;

        pasting = true;
        globalThis.PrestoPasting = true;

        // Clear tray immediately so a second click / storage sync can't re-paste
        await setTray([]);
        document.querySelectorAll('.pt-paste-btn').forEach((el) => {
            el.disabled = true;
            el.textContent = 'Pasting…';
        });
        globalThis.PrestoToast?.dismissSticky?.();

        try {
            const field = await ensureAddItemField(checklist);
            if (!field) {
                await setTray(items);
                showToast('Could not find Add an item field');
                return;
            }

            const payload = lines.join('\n');
            const countBefore = countChecklistItems(checklist);

            setFieldValue(field, payload);
            await sleep(80);
            if ((field.value || '').replace(/\r\n/g, '\n').trim() !== payload) {
                setFieldValue(field, payload);
                await sleep(80);
            }

            submitComposer(field);
            const added = await waitForItemsAdded(
                checklist,
                countBefore,
                lines.length,
                PASTE_TIMEOUT_MS,
            );

            if (field.isConnected && (field.value || '') !== '') {
                setFieldValue(field, '');
            }

            if (added <= 0) {
                await setTray(items);
                showToast('Paste failed — Trello did not accept the items');
                return;
            }

            if (added < lines.length) {
                const rest = items.slice(added);
                await setTray(rest);
                showToast(
                    `Pasted to checklist (${added}) · ${rest.length} left`,
                );
                return;
            }

            // If Trello ignored newlines and made one blob item, restore clipboard
            // (user may need to delete that one combined row)
            if (added === 1 && lines.length > 1) {
                await setTray(items);
                showToast(
                    'Trello created one combined item — delete it, then try Paste again',
                );
                return;
            }

            showToast(`Pasted to checklist (${Math.min(added, lines.length)})`);
        } finally {
            pasting = false;
            globalThis.PrestoPasting = false;
            syncUi();
        }
    }

    function findAddItemAnchor(checklist) {
        const trigger = findAddItemTrigger(checklist);
        if (trigger) return trigger;

        const field = findAddItemField(checklist);
        if (field) {
            return (
                field.closest('[data-testid="checklist-add-item"]') ||
                field.closest('form') ||
                field.parentElement ||
                field
            );
        }

        return checklist.querySelector('[data-testid="checklist-add-item"]');
    }

    function removeClipboardActions(root) {
        if (!root?.querySelectorAll) return;
        root.querySelectorAll('.pt-clipboard-actions').forEach((el) => el.remove());
        root
            .querySelectorAll('.pt-paste-btn, .pt-clear-clipboard-btn')
            .forEach((el) => el.remove());
    }

    function placeClipboardActions(checklist, group) {
        const anchor = findAddItemAnchor(checklist);
        withInjecting(() => {
            if (!anchor) {
                // Checklist chrome not ready yet — park at end; next scan will re-place
                if (group.parentElement !== checklist) {
                    checklist.appendChild(group);
                }
                return;
            }

            if (anchor.nextElementSibling !== group) {
                anchor.insertAdjacentElement('afterend', group);
            }

            const parent = anchor.parentElement;
            if (parent && !parent.classList.contains('pt-add-row')) {
                const kids = [...parent.children].filter(
                    (el) => el.nodeType === 1,
                );
                if (kids.length <= 5) {
                    parent.classList.add('pt-add-row');
                }
            }
        });
    }

    function injectPasteControl(checklist) {
        // Avoid double controls when section nests inside container
        if (
            checklist.matches?.('[data-testid="checklist-container"]') &&
            checklist.querySelector(':scope > [data-testid="checklist-section"], [data-testid="checklist-section"]')
        ) {
            // Only strip if we previously parked actions on the outer container
            if (checklist.querySelector(':scope > .pt-clipboard-actions')) {
                removeClipboardActions(checklist);
            }
            return;
        }

        if (tray.length === 0 || pasting) {
            removeClipboardActions(checklist);
            return;
        }

        let group = checklist.querySelector('.pt-clipboard-actions');
        if (group?.isConnected) {
            const pasteBtn = group.querySelector('.pt-paste-btn');
            if (pasteBtn) {
                const label = `Paste (${tray.length})`;
                if (pasteBtn.textContent !== label) {
                    pasteBtn.textContent = label;
                    pasteBtn.title = `Paste ${tray.length} item${tray.length === 1 ? '' : 's'} from Presto`;
                }
                pasteBtn.disabled = false;
            }
            // Cheap attachment check — avoid findAddItemAnchor on every sync
            if (!group.previousElementSibling?.matches?.('button, a, form, [data-testid="checklist-add-item"]') &&
                !group.parentElement?.querySelector('[data-testid="checklist-add-item"], textarea')) {
                placeClipboardActions(checklist, group);
            }
            return;
        }

        // Collapse any stray duplicates from older builds
        const groups = [
            ...checklist.querySelectorAll('.pt-clipboard-actions'),
        ].filter((el) => el.isConnected);
        group = groups[0] || null;
        groups.slice(1).forEach((el) => el.remove());

        checklist
            .querySelectorAll('.pt-paste-btn, .pt-clear-clipboard-btn')
            .forEach((el) => {
                if (!el.closest('.pt-clipboard-actions')) el.remove();
            });

        if (!group) {
            withInjecting(() => {
                group = document.createElement('div');
                group.className = 'pt-clipboard-actions';

                const pasteBtn = document.createElement('button');
                pasteBtn.type = 'button';
                pasteBtn.className = 'pt-paste-btn pt-trello-btn';
                group.appendChild(pasteBtn);
            });
        }

        placeClipboardActions(checklist, group);

        const pasteBtn = group.querySelector('.pt-paste-btn');
        if (pasteBtn) {
            pasteBtn.textContent = `Paste (${tray.length})`;
            pasteBtn.title = `Paste ${tray.length} item${tray.length === 1 ? '' : 's'} from Presto`;
            pasteBtn.disabled = false;
        }
    }

    function updatePasteButtons() {
        if (pasting) return;

        if (tray.length === 0) {
            if (lastPasteCount !== 0) {
                document
                    .querySelectorAll('.pt-clipboard-actions')
                    .forEach((el) => el.remove());
                lastPasteCount = 0;
            }
            return;
        }

        lastPasteCount = tray.length;
        const root = cardRoot();
        const sections = root.querySelectorAll(
            '[data-testid="checklist-section"]',
        );
        if (sections.length) {
            sections.forEach(injectPasteControl);
        } else {
            root
                .querySelectorAll('[data-testid="checklist-container"]')
                .forEach(injectPasteControl);
        }
    }

    // ─── Sync / observe ───────────────────────────────────────────────────────

    function syncUi() {
        updateClipboardToast();
        if (!isCardContext()) return;
        updatePasteButtons();
        refreshAlreadyStagedHints();
    }

    /** Toast immediately; debounce the expensive checklist walk. */
    function scheduleSyncUi() {
        updateClipboardToast();
        clearTimeout(syncTimer);
        syncTimer = setTimeout(() => {
            if (pasting || !isCardContext()) return;
            updatePasteButtons();
            refreshAlreadyStagedHints();
        }, 80);
    }

    function scanDom() {
        if (!isCardContext()) return;
        // Copy buttons are hover-only; scans only maintain paste chrome + staged hints
        updatePasteButtons();
        refreshAlreadyStagedHints(cardRoot());
    }

    function scanIncremental(items, needsPaste) {
        if (!isCardContext()) return;
        if (!tray.length) {
            updatePasteButtons();
            refreshAlreadyStagedHints();
            return;
        }
        const unique = [...new Set(items.filter((el) => el?.isConnected))];
        for (const el of unique) {
            updateStagedHighlight(el);
        }
        if (needsPaste || tray.length) updatePasteButtons();
    }

    function scheduleScan(items, needsPaste = false) {
        if (needsPaste) pendingPasteScan = true;
        if (items === null) {
            pendingFullScan = true;
        } else if (items?.length && !pendingFullScan) {
            pendingScanItems.push(...items);
        }

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const full = pendingFullScan;
            const batch = pendingScanItems;
            const paste = pendingPasteScan;
            pendingFullScan = false;
            pendingScanItems = [];
            pendingPasteScan = false;
            if (full) scanDom();
            else scanIncremental(batch, paste);
        }, SCAN_DEBOUNCE_MS);
    }

    function isOwnNode(n) {
        if (n.nodeType !== 1) return false;
        return !!(
            n.id === 'pt-toast' ||
            n.id === 'pt-toast-stack' ||
            n.id === 'pt-toast-sticky' ||
            n.id === 'pt-toast-flash' ||
            n.classList?.contains('pt-copy-btn') ||
            n.classList?.contains('pt-paste-btn') ||
            n.classList?.contains('pt-clear-clipboard-btn') ||
            n.classList?.contains('pt-clipboard-actions') ||
            n.classList?.contains('pt-toast') ||
            n.classList?.contains('pt-toast-stack') ||
            n.classList?.contains('pt-add-row') ||
            n.closest?.(
                '#pt-toast-stack, #pt-toast, .pt-clipboard-actions, .pt-copy-btn, .pt-paste-btn',
            )
        );
    }

    function looksLikeAddItem(el) {
        if (!(el instanceof Element)) return false;
        if (
            el.classList?.contains('pt-paste-btn') ||
            el.classList?.contains('pt-clear-clipboard-btn')
        ) {
            return false;
        }
        const ph = (el.getAttribute?.('placeholder') || '').toLowerCase();
        if (ph.includes('add an item') || ph.includes('add item')) return true;
        if (el.matches?.('button, a, [role="button"]')) {
            const t = (el.textContent || '').trim();
            return /^add an item$/i.test(t) || /^add item$/i.test(t);
        }
        return false;
    }

    function collectMutationWork(mutations) {
        /** @type {Element[]} */
        const items = [];
        let needsPaste = false;

        for (const m of mutations) {
            // Ignore aria-checked attribute noise (handled by content.js)
            if (m.type === 'attributes') continue;

            for (const n of m.addedNodes) {
                if (n.nodeType !== 1 || isOwnNode(n)) continue;
                if (
                    n.hasAttribute?.('data-pt-chip') ||
                    n.classList?.contains('pt-chip') ||
                    n.classList?.contains('pt-chip-row')
                ) {
                    continue;
                }

                if (n.matches?.(SELECTOR_ITEM)) {
                    items.push(n);
                } else {
                    const found = n.querySelectorAll?.(SELECTOR_ITEM);
                    if (found?.length) items.push(...found);
                }

                if (
                    n.matches?.(SELECTOR_CHECKLIST) ||
                    n.querySelector?.(
                        '[data-testid="checklist-section"], [data-testid="checklist-container"], [data-testid="checklist-add-item"]',
                    )
                ) {
                    needsPaste = true;
                }

                if (looksLikeAddItem(n)) needsPaste = true;
            }
        }

        return { items, needsPaste };
    }

    function onDomMutations(mutations) {
        if (pasting || injecting) return;
        if (!isCardContext()) return;
        // Empty clipboard: copy buttons are hover-only; skip mutation scans
        if (!tray.length) return;
        const { items, needsPaste } = collectMutationWork(mutations);
        if (!items.length && !needsPaste) return;
        scheduleScan(items, needsPaste);
    }

    globalThis.PrestoDom?.subscribe(onDomMutations);

    // Inject on hover; remove on leave so icons never stick visible
    document.addEventListener(
        'pointerover',
        (e) => {
            if (!isCardContext()) return;
            const item = e.target?.closest?.(SELECTOR_ITEM);
            if (!item) return;
            if (item.querySelector('.pt-copy-btn')) return;
            injectCopyControl(item, { highlight: false });
        },
        true,
    );

    document.addEventListener(
        'pointerout',
        (e) => {
            const item = e.target?.closest?.(SELECTOR_ITEM);
            if (!item) return;
            const next = e.relatedTarget;
            if (next instanceof Node && item.contains(next)) return;
            item.querySelectorAll('.pt-copy-btn').forEach((el) => el.remove());
        },
        true,
    );

    // Trello is an SPA — retarget observer + reinject when the card changes
    let lastHref = location.href;
    let navRetryTimers = [];
    async function onNavigate() {
        if (pasting) return;
        adoptTray(await getTray());
        lastPasteCount = -1;
        globalThis.PrestoDom?.retarget?.();
        if (!isCardContext()) return;
        scheduleScan(null, true);
        navRetryTimers.forEach(clearTimeout);
        navRetryTimers = [
            setTimeout(() => {
                if (pasting) return;
                globalThis.PrestoDom?.retarget?.();
                if (isCardContext()) scheduleScan(null, true);
            }, 500),
            setTimeout(() => {
                if (pasting) return;
                globalThis.PrestoDom?.retarget?.();
                if (isCardContext()) scheduleScan(null, true);
            }, 1500),
        ];
    }

    function checkNavigation() {
        if (location.href === lastHref) return;
        lastHref = location.href;
        onNavigate().catch(console.error);
    }

    let navClickTimer = 0;
    function scheduleNavigationCheck() {
        queueMicrotask(checkNavigation);
        clearTimeout(navClickTimer);
        navClickTimer = setTimeout(checkNavigation, 300);
    }

    window.addEventListener('popstate', checkNavigation);
    window.addEventListener('hashchange', checkNavigation);
    document.addEventListener(
        'click',
        (e) => {
            const a = e.target?.closest?.('a[href]');
            if (!a) return;
            scheduleNavigationCheck();
        },
        true,
    );
    // Chromium Navigation API (no polling)
    try {
        navigation?.addEventListener?.('navigate', scheduleNavigationCheck);
    } catch {
        /* unsupported */
    }

    // Delegated clicks — avoids stacked listeners when controls are re-injected
    document.addEventListener(
        'click',
        (e) => {
            const copyBtn = e.target?.closest?.('.pt-copy-btn');
            if (copyBtn) {
                e.preventDefault();
                e.stopPropagation();
                const item = copyBtn.closest(SELECTOR_ITEM);
                if (item) copyItem(item);
                return;
            }

            const pasteBtn = e.target?.closest?.('.pt-paste-btn');
            if (!pasteBtn) return;
            e.preventDefault();
            e.stopPropagation();
            if (pasting) return;
            const checklist = pasteBtn.closest(SELECTOR_CHECKLIST);
            if (checklist) pasteIntoChecklist(checklist);
        },
        true,
    );

    async function init() {
        adoptTray(await getTray());
        globalThis.PrestoDom?.retarget?.();
        if (isCardContext()) scanDom();
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        if (pasting) {
            // Keep in-memory tray authoritative during an active paste
            return;
        }
        adoptTray(changes[STORAGE_KEY].newValue);
        lastPasteCount = -1;
        scheduleSyncUi();
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            init().catch(console.error);
        });
    } else {
        init().catch(console.error);
    }
})();
