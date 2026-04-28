const STYLE_ID = 'presto-styles';

const SELECTOR_DIV =
    '[data-testid="check-item-container"]:has(input[aria-checked="true"]) [data-testid="check-item-name"] > div > div';
const SELECTOR_P =
    '[data-testid="check-item-container"]:has(input[aria-checked="true"]) [data-testid="check-item-name"] p';

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

function processItem(p, chipMap) {
    // Skip if inside an active Trello editor
    if (
        p.closest('[contenteditable="true"]') ||
        p.closest('[data-testid="check-item-editor"]')
    ) {
        return;
    }

    // Remove previously injected chips so we can re-process cleanly
    p.querySelectorAll('[data-pt-chip]').forEach((el) => {
        el.replaceWith(document.createTextNode(`[${el.dataset.btChip}]`));
    });

    // Walk text nodes only — preserves existing <a> tags and other HTML
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);
    for (const tn of textNodes) processTextNode(tn, chipMap);
}

function processAllItems(chipMap) {
    if (!chipMap) return;
    document
        .querySelectorAll(SELECTOR_ALL_P)
        .forEach((p) => processItem(p, chipMap));
}

function removeAllChips() {
    document.querySelectorAll('[data-pt-chip]').forEach((el) => {
        el.replaceWith(document.createTextNode(`[${el.dataset.btChip}]`));
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
    if (divRules.length) {
        css += `${SELECTOR_DIV} { ${divRules.join(' ')} }\n`;
    }
    if (s.showCheckIcon) {
        css += `${SELECTOR_P}::after { content: " ✓"; }\n`;
    }

    if (s.hideComments) {
        // Hide the comments/activity aside panel
        css += `aside:has([data-testid="card-back-panel"]) { display: none !important; }\n`;
        // Remove max-width from the main content column and checklist headings
        css += `div:has(> [data-testid="checklist-container"]) { max-width: none !important; flex: 1 1 auto !important; }\n`;
        css += `hgroup { max-width: none !important; }\n`;
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
}

// ─── MutationObserver ─────────────────────────────────────────────────────────

let debounceTimer;
let currentChipMap = null;
let currentPackId = 'qa';
let initGeneration = 0; // incremented on each init() call; stale calls self-abort

function scheduleProcess() {
    if (!currentChipMap) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        const chipMap = currentChipMap;
        if (!chipMap || processing) return;
        processing = true;
        try {
            processAllItems(chipMap);
        } finally {
            processing = false;
        }
    }, 150);
}

const observer = new MutationObserver((mutations) => {
    if (processing) return;

    let needsProcess = false;

    for (const m of mutations) {
        for (const n of m.addedNodes) {
            if (n.nodeType !== 1) continue;
            // Watch for the edit action toolbar (contains Assign / Due date).
            // The due-date button's parentElement is the toolbar div.
            if (n.matches?.('[data-testid="check-item-set-due-button"]')) {
                injectEditChipRow(n.parentElement);
            } else {
                const dueBtn = n.querySelector?.(
                    '[data-testid="check-item-set-due-button"]',
                );
                if (dueBtn) injectEditChipRow(dueBtn.parentElement);
            }
            // New check items rendered
            if (
                n.matches?.('[data-testid="check-item-name"]') ||
                n.matches?.('[data-testid="check-item-container"]') ||
                n.querySelector?.('[data-testid="check-item-name"]')
            ) {
                needsProcess = true;
            }
        }
        if (
            m.target.nodeType === 1 &&
            m.target.closest?.('[data-testid="check-item-name"]')
        ) {
            needsProcess = true;
        }
    }

    if (needsProcess) scheduleProcess();
});

observer.observe(document.body, { childList: true, subtree: true });

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

    processing = true;
    try {
        processAllItems(chipMap);
    } finally {
        processing = false;
    }
}

chrome.storage.sync.get(DEFAULTS, init);

chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === 'sync') {
        chrome.storage.sync.get(DEFAULTS, init);
    }
});
