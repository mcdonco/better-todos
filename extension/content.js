const STYLE_ID = 'better-todos-styles';

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
    activeChipPack: 'qa',
    chipColors: {},
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
    const map = {};
    for (const chip of pack.chips) {
        map[chip.label] = colorOverrides[chip.label] || chip.color;
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
const CHIP_RE = /\[([a-z0-9-]+)\](?!\()/gi;

let processing = false;

function processTextNode(textNode, chipMap) {
    const text = textNode.nodeValue;
    CHIP_RE.lastIndex = 0;
    if (!CHIP_RE.test(text)) return; // fast exit if no tags

    CHIP_RE.lastIndex = 0;
    const parent = textNode.parentNode;
    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match;

    CHIP_RE.lastIndex = 0;
    while ((match = CHIP_RE.exec(text)) !== null) {
        const label = match[1].toLowerCase();
        const color = chipMap[label];
        if (!color) continue; // unknown label — leave as plain text

        // Text before this match
        if (match.index > lastIndex) {
            frag.appendChild(
                document.createTextNode(text.slice(lastIndex, match.index)),
            );
        }

        // Chip span
        const span = document.createElement('span');
        span.className = 'bt-chip';
        span.style.background = hexToRgba(color, 0.15);
        span.style.color = color;
        span.textContent = label;
        span.setAttribute('data-bt-chip', label);
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
    p.querySelectorAll('[data-bt-chip]').forEach((el) => {
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
    document
        .querySelectorAll(SELECTOR_ALL_P)
        .forEach((p) => processItem(p, chipMap));
}

function removeAllChips() {
    document.querySelectorAll('[data-bt-chip]').forEach((el) => {
        el.replaceWith(document.createTextNode(`[${el.dataset.btChip}]`));
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
    if (divRules.length) {
        css += `${SELECTOR_DIV} { ${divRules.join(' ')} }\n`;
    }
    if (s.showCheckIcon) {
        css += `${SELECTOR_P}::after { content: " ✓"; }\n`;
    }

    // Base chip styles (color and background are applied inline per-chip)
    css += `.bt-chip {
        display: inline-flex;
        align-items: center;
        padding: 1px 8px;
        border-radius: 20px;
        font-size: 11px;
        font-weight: 700;
        margin-left: 5px;
        vertical-align: middle;
        text-decoration: none !important;
        line-height: 1.6;
        letter-spacing: 0.03em;
    }\n`;

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

function scheduleProcess() {
    if (!currentChipMap) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        if (processing) return;
        processing = true;
        processAllItems(currentChipMap);
        processing = false;
    }, 150);
}

const observer = new MutationObserver((mutations) => {
    if (processing) return;
    // Only act if a check-item-name node was added/changed
    const relevant = mutations.some(
        (m) =>
            [...m.addedNodes].some(
                (n) =>
                    n.nodeType === 1 &&
                    (n.matches?.('[data-testid="check-item-name"]') ||
                        n.querySelector?.('[data-testid="check-item-name"]')),
            ) ||
            (m.target.nodeType === 1 &&
                m.target.closest?.('[data-testid="check-item-name"]')),
    );
    if (relevant) scheduleProcess();
});

observer.observe(document.body, { childList: true, subtree: true });

// ─── Initialise ───────────────────────────────────────────────────────────────

async function init(settings) {
    applyStyles(settings);

    if (!settings.chipsEnabled) {
        removeAllChips();
        currentChipMap = null;
        return;
    }

    const packs = await loadPacks();
    const pack = getPackById(packs, settings.activeChipPack);
    const chipColors = settings.chipColors || {};
    currentChipMap = buildChipMap(pack, chipColors);

    processing = true;
    processAllItems(currentChipMap);
    processing = false;
}

const STORAGE_KEYS = Object.keys(DEFAULTS);

chrome.storage.sync.get(DEFAULTS, init);

chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === 'sync') {
        chrome.storage.sync.get(DEFAULTS, init);
    }
});
