const STYLE_ID = 'presto-styles';
const CLASS_COMPLETED = 'pt-completed';
const SELECTOR_ITEM = '[data-testid="check-item-container"]';
const SELECTOR_ALL_P = '[data-testid="check-item-name"] p';

const DEFAULTS = {
    noStrikethrough: true,
    showCheckIcon: true,
    completedColor: '#a6da58',
    chipsEnabled: true,
    chipColorsEnabled: true,
    activeChipPack: 'qa',
    chipColors: {},
    hideComments: false,
};

// ─── Chip pack data ───────────────────────────────────────────────────────────

let cachedPacks = null;

async function loadPacks() {
    if (cachedPacks) return cachedPacks;
    const url = chrome.runtime.getURL('chips.json');
    const res = await fetch(url);
    const data = await res.json();
    cachedPacks = data.packs;
    return cachedPacks;
}

function getPackById(packs, id) {
    return packs.find((p) => p.id === id) || packs[0];
}

function buildChipMap(pack, colorOverrides) {
    const overrides = colorOverrides || {};
    const map = {};
    for (const chip of pack.chips) {
        map[chip.label] = overrides[chip.label] || chip.color;
    }
    return map;
}

// ─── DOM chip processing ──────────────────────────────────────────────────────

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Regex: matches [label] but NOT [label]( (Markdown link syntax)
// Defined as a factory so each call gets a fresh stateless instance —
// a module-level /g regex would share lastIndex across re-entrant calls.
function makeChipRe() {
    return /\[([a-z0-9-]+)\](?!\()/gi;
}

let processing = false;

function processTextNode(textNode, chipMap) {
    const text = textNode.nodeValue;
    const CHIP_RE = makeChipRe();
    if (!CHIP_RE.test(text)) return; // fast exit if no tags

    const parent = textNode.parentNode;
    if (!parent) return; // node was detached before we got here

    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match;

    const RE = makeChipRe(); // fresh instance for the exec loop
    while ((match = RE.exec(text)) !== null) {
        const label = match[1].toLowerCase();
        const color = chipMap?.[label]; // null-safe: chipMap should never be null here, but guard anyway
        const isKnown = !!color;
        const chipColor = color || '#cecfd2'; // grey fallback for unknown labels

        // Text before this match
        if (match.index > lastIndex) {
            frag.appendChild(
                document.createTextNode(text.slice(lastIndex, match.index)),
            );
        }

        // Chip span
        const span = document.createElement('span');
        span.className = isKnown ? 'pt-chip' : 'pt-chip pt-chip-generic';
        span.style.background = hexToRgba(chipColor, 0.15);
        span.style.color = chipColor;
        span.textContent = label;
        span.setAttribute('data-pt-chip', label);
        frag.appendChild(span);

        lastIndex = match.index + match[0].length;
    }

    // Remaining text after last match
    if (lastIndex < text.length) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    // Only mutate DOM if we actually produced chip spans
    if (frag.childNodes.length > 1 || frag.firstChild?.nodeName === 'SPAN') {
        parent.replaceChild(frag, textNode);
    }
}

function isPrestoChipNode(n) {
    return (
        n.nodeType === 1 &&
        (n.hasAttribute?.('data-pt-chip') ||
            n.classList?.contains('pt-chip') ||
            n.classList?.contains('pt-chip-row') ||
            n.classList?.contains('pt-picker-item'))
    );
}

/** True when raw `[label]` text still needs converting (or chips need refresh). */
function hasRawChipSyntax(root) {
    if (!root) return false;
    if (root.nodeType === Node.TEXT_NODE) {
        const v = root.nodeValue || '';
        return v.includes('[') && makeChipRe().test(v);
    }
    if (root.nodeType !== Node.ELEMENT_NODE) return false;
    // Fast reject: no brackets in the subtree text
    const sample = root.textContent || '';
    if (!sample.includes('[')) return false;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
        const v = node.nodeValue || '';
        if (v.includes('[') && makeChipRe().test(v)) return true;
    }
    return false;
}

function isPrestoUiNode(n) {
    return (
        n.nodeType === 1 &&
        (isPrestoChipNode(n) ||
            n.id === 'pt-toast' ||
            n.id === 'pt-toast-stack' ||
            n.classList?.contains('pt-copy-btn') ||
            n.classList?.contains('pt-paste-btn') ||
            n.classList?.contains('pt-clipboard-actions') ||
            n.classList?.contains('pt-toast') ||
            n.classList?.contains('pt-toast-stack') ||
            n.closest?.(
                '#pt-toast-stack, #pt-toast, .pt-copy-btn, .pt-paste-btn, .pt-clipboard-actions, .pt-chip-row',
            ))
    );
}

function processItem(p, chipMap, { force = false } = {}) {
    // Skip if inside an active Trello editor
    if (
        p.closest('[contenteditable="true"]') ||
        p.closest('[data-testid="check-item-editor"]')
    ) {
        return;
    }

    // Already converted and nothing new to parse — avoid strip/rebuild churn
    if (!force && !hasRawChipSyntax(p)) return;

    // Remove previously injected chips so we can re-process cleanly
    p.querySelectorAll('[data-pt-chip]').forEach((el) => {
        el.replaceWith(document.createTextNode(`[${el.dataset.ptChip}]`));
    });

    // Walk text nodes only — preserves existing <a> tags and other HTML
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);
    for (const tn of textNodes) processTextNode(tn, chipMap);
}

function processAllItems(chipMap, { force = false } = {}) {
    if (!chipMap) return;
    document
        .querySelectorAll(SELECTOR_ALL_P)
        .forEach((p) => processItem(p, chipMap, { force }));
}

function removeAllChips() {
    document.querySelectorAll('[data-pt-chip]').forEach((el) => {
        el.replaceWith(document.createTextNode(`[${el.dataset.ptChip}]`));
    });
}

// ─── Click-to-apply: inline chip row ────────────────────────────────────────

function currentPackChips() {
    const chipMap = currentChipMap; // snapshot to avoid TOCTOU with concurrent init()
    if (!cachedPacks || !chipMap) return [];
    const pack =
        cachedPacks.find((p) => p.id === currentPackId) || cachedPacks[0];
    return pack.chips.map((c) => ({
        label: c.label,
        color: chipMap[c.label] || c.color,
    }));
}

// toolbar = the div containing Assign / Due date / overflow buttons
// (the parentElement of [data-testid="check-item-set-due-button"])
function injectEditChipRow(toolbar) {
    const form = toolbar.closest('form');
    if (!form) return;
    if (form.querySelector('.pt-chip-row')) return;

    const chips = currentPackChips();
    if (!chips.length) return;

    const row = document.createElement('div');
    row.className = 'pt-chip-row';

    // "Remove" button — strips any pack chip from the text
    const removeBtn = document.createElement('button');
    removeBtn.className = 'pt-picker-item pt-picker-remove';
    removeBtn.type = 'button';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove chip';
    removeBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        applyChipToItem(form, null);
    });
    row.appendChild(removeBtn);

    for (const chip of chips) {
        const btn = document.createElement('button');
        btn.className = 'pt-picker-item';
        btn.type = 'button';
        btn.style.setProperty('--chip-color', chip.color);
        btn.style.setProperty('--chip-bg', hexToRgba(chip.color, 0.15));
        btn.textContent = chip.label;
        btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            applyChipToItem(form, chip.label);
        });
        row.appendChild(btn);
    }

    // Insert before the button container (Save/Cancel + toolbar),
    // so the chip row sits between the textarea and the action buttons.
    const menuItem =
        toolbar.closest('[role="menuitem"]') || toolbar.parentElement;
    menuItem.insertAdjacentElement('beforebegin', row);
}

// ─── Write chip back to Trello text ──────────────────────────────────────────

// React ignores direct .value assignments — use the native setter to trigger onChange
const nativeTextareaSetter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value',
).set;

function applyChipToItem(editContainer, label) {
    const textarea = editContainer.querySelector('textarea');
    if (!textarea) return;

    // Strip all [tag] chips — both pack chips and generic ones
    let rawText = textarea.value;
    rawText = rawText.replace(/\s*\[[a-z0-9-]+\](?!\()/gi, '').trimEnd();

    const newText = label ? `${rawText} [${label}]` : rawText;

    nativeTextareaSetter.call(textarea, newText);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.focus();
    textarea.setSelectionRange(newText.length, newText.length);
}

// ─── Completed / layout classes (avoid expensive :has() selectors) ────────────

function isItemCompleted(container) {
    const input = container.querySelector(
        'input[aria-checked], input[type="checkbox"]',
    );
    if (!input) return false;
    return (
        input.getAttribute('aria-checked') === 'true' || input.checked === true
    );
}

function syncCompletedClass(container) {
    if (!(container instanceof Element)) return;
    container.classList.toggle(CLASS_COMPLETED, isItemCompleted(container));
}

function syncCompletedIn(scope) {
    const root = scope || globalThis.PrestoDom?.cardRoot?.() || document;
    root.querySelectorAll?.(SELECTOR_ITEM)?.forEach(syncCompletedClass);
}

function syncLayoutClasses(hideComments) {
    document.documentElement.classList.toggle('pt-hide-comments', !!hideComments);

    document
        .querySelectorAll('[data-testid="card-back-panel"]')
        .forEach((el) => {
            el.closest('aside')?.classList.toggle(
                'pt-comments-aside',
                !!hideComments,
            );
        });

    document
        .querySelectorAll('[data-testid="checklist-container"]')
        .forEach((el) => {
            el.parentElement?.classList.toggle(
                'pt-checklist-column',
                !!hideComments,
            );
        });
}

// ─── CSS styles ───────────────────────────────────────────────────────────────

function buildCSS(settings) {
    const s = Object.assign({}, DEFAULTS, settings);
    const divRules = [];
    let css = '';

    if (s.noStrikethrough) {
        divRules.push('text-decoration: none !important;');
    }
    if (s.completedColor) {
        divRules.push(`color: ${s.completedColor} !important;`);
    }
    // Class-based — no :has() style recalc on every DOM change
    if (divRules.length) {
        css += `.${CLASS_COMPLETED} [data-testid="check-item-name"] > div > div { ${divRules.join(' ')} }\n`;
    }
    if (s.showCheckIcon) {
        css += `.${CLASS_COMPLETED} [data-testid="check-item-name"] p::after { content: " ✓"; }\n`;
    }

    return css;
}

function applyStyles(settings) {
    let el = document.getElementById(STYLE_ID);
    if (!el) {
        el = document.createElement('style');
        el.id = STYLE_ID;
        document.head.appendChild(el);
    }
    el.textContent = buildCSS(settings);
    syncLayoutClasses(settings.hideComments);
    syncCompletedIn();
}

// ─── MutationObserver ─────────────────────────────────────────────────────────

let debounceTimer;
let currentChipMap = null;
let currentPackId = 'qa';
let initGeneration = 0; // incremented on each init() call; stale calls self-abort

/** @type {Set<Element>} */
let pendingRoots = new Set();
let pendingForce = false;

function scheduleProcess(roots, { force = false } = {}) {
    if (!currentChipMap) return;
    if (force) pendingForce = true;
    if (roots) {
        for (const r of roots) {
            if (r?.nodeType === 1) pendingRoots.add(r);
        }
    }
    clearTimeout(debounceTimer);
    // While Presto is bulk-pasting, wait for the burst to finish
    const delay = globalThis.PrestoPasting ? 400 : 200;
    debounceTimer = setTimeout(() => {
        const chipMap = currentChipMap;
        if (!chipMap || processing) return;
        const forceNow = pendingForce;
        const rootsNow = pendingRoots;
        pendingForce = false;
        pendingRoots = new Set();
        processing = true;
        try {
            if (forceNow || rootsNow.size === 0) {
                processAllItems(chipMap, { force: forceNow });
            } else {
                for (const root of rootsNow) {
                    if (!root.isConnected) continue;
                    if (root.matches?.(SELECTOR_ALL_P)) {
                        processItem(root, chipMap);
                    } else {
                        root
                            .querySelectorAll?.(SELECTOR_ALL_P)
                            ?.forEach((p) => processItem(p, chipMap));
                    }
                }
            }
        } finally {
            processing = false;
        }
    }, delay);
}

function onDomMutations(mutations) {
    if (processing) return;

    // Empty list = card retarget signal from PrestoDom
    if (!mutations.length) {
        if (document.documentElement.classList.contains('pt-hide-comments')) {
            syncLayoutClasses(true);
        }
        syncCompletedIn();
        return;
    }

    /** @type {Element[]} */
    const roots = [];
    let layoutDirty = false;

    for (const m of mutations) {
        // Checkbox toggles — cheap class flip, no :has() needed
        if (
            m.type === 'attributes' &&
            m.attributeName === 'aria-checked' &&
            m.target instanceof Element
        ) {
            const item = m.target.closest(SELECTOR_ITEM);
            if (item) syncCompletedClass(item);
            continue;
        }

        for (const n of m.addedNodes) {
            if (n.nodeType !== 1 || isPrestoUiNode(n)) continue;

            if (n.matches?.('[data-testid="check-item-set-due-button"]')) {
                injectEditChipRow(n.parentElement);
            } else {
                const dueBtn = n.querySelector?.(
                    '[data-testid="check-item-set-due-button"]',
                );
                if (dueBtn) injectEditChipRow(dueBtn.parentElement);
            }

            if (n.matches?.(SELECTOR_ITEM)) {
                syncCompletedClass(n);
                roots.push(n);
            } else if (
                n.matches?.('[data-testid="check-item-name"]') ||
                n.querySelector?.('[data-testid="check-item-name"]')
            ) {
                const nested = n.querySelectorAll?.(SELECTOR_ITEM);
                if (nested?.length) nested.forEach(syncCompletedClass);
                else n.closest?.(SELECTOR_ITEM) && syncCompletedClass(n.closest(SELECTOR_ITEM));
                roots.push(n);
            }

            if (
                n.matches?.(
                    '[data-testid="card-back-panel"], [data-testid="checklist-container"]',
                ) ||
                n.querySelector?.(
                    '[data-testid="card-back-panel"], [data-testid="checklist-container"]',
                )
            ) {
                layoutDirty = true;
            }
        }

        if (
            m.target.nodeType === 1 &&
            m.target.closest?.('[data-testid="check-item-name"]') &&
            !m.target.closest?.('[data-pt-chip], .pt-chip-row, .pt-copy-btn')
        ) {
            for (const n of m.addedNodes) {
                if (n.nodeType === Node.TEXT_NODE && hasRawChipSyntax(n)) {
                    const p = m.target.closest?.('p') || m.target;
                    if (p) roots.push(p);
                    break;
                }
                if (
                    n.nodeType === 1 &&
                    !isPrestoUiNode(n) &&
                    hasRawChipSyntax(n)
                ) {
                    roots.push(n);
                    break;
                }
            }
        }
    }

    if (layoutDirty && document.documentElement.classList.contains('pt-hide-comments')) {
        syncLayoutClasses(true);
    }
    if (roots.length) scheduleProcess(roots);
}

globalThis.PrestoDom?.subscribe(onDomMutations);

// ─── Initialise ───────────────────────────────────────────────────────────────

async function init(settings) {
    const gen = ++initGeneration; // capture this call's generation
    applyStyles(settings);

    if (!settings.chipsEnabled) {
        removeAllChips();
        currentChipMap = null;
        return;
    }

    const packs = await loadPacks();
    if (gen !== initGeneration) return; // a newer init() has already taken over

    const pack = getPackById(packs, settings.activeChipPack);
    const chipColors = settings.chipColors || {};
    // Build locally — don't read currentChipMap after the await or a concurrent
    // init() may have set it to null in the meantime.
    const chipMap = settings.chipColorsEnabled
        ? buildChipMap(pack, chipColors)
        : {};

    currentChipMap = chipMap;
    currentPackId = pack.id;

    syncCompletedIn();
    scheduleProcess(null, { force: true });
}

chrome.storage.sync.get(DEFAULTS, init);

const CHIP_SETTING_KEYS = new Set([
    'chipsEnabled',
    'chipColorsEnabled',
    'activeChipPack',
    'chipColors',
]);
const STYLE_SETTING_KEYS = new Set([
    'noStrikethrough',
    'showCheckIcon',
    'completedColor',
    'hideComments',
]);

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    const keys = Object.keys(changes);
    const touchesChips = keys.some((k) => CHIP_SETTING_KEYS.has(k));
    const touchesStyle = keys.some((k) => STYLE_SETTING_KEYS.has(k));
    if (!touchesChips && !touchesStyle) return;

    chrome.storage.sync.get(DEFAULTS, (settings) => {
        if (touchesStyle && !touchesChips) {
            applyStyles(settings);
            return;
        }
        init(settings);
    });
});
