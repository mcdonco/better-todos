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

const noStrikethroughEl = document.getElementById('noStrikethrough');
const showCheckIconEl = document.getElementById('showCheckIcon');
const hideCommentsEl = document.getElementById('hideComments');
const customSwatchEl = document.getElementById('customSwatch');
const colorPreviewEl = document.getElementById('colorPreview');
const colorPickerPanel = document.getElementById('colorPickerPanel');
const swatches = document.querySelectorAll('#colorPickerPanel .swatch');
const savedEl = document.getElementById('saved');
const badgesNavRowEl = document.getElementById('badgesNavRow');
const versionEl = document.getElementById('ext-version');
const chipsEnabledEl = document.getElementById('chipsEnabled');
const chipColorsEl = document.getElementById('chipColorsEnabled');
const chipPackEl = document.getElementById('chipPack');
const chipListEl = document.getElementById('chipList');
const colorBadgesSectionEl = document.getElementById('colorBadgesSection');

const DEFAULT_PREVIEW = '#454f59';

/** @type {HTMLInputElement | null} */
let customColorEl = null;

function setColorPreview(color) {
    if (!colorPreviewEl) return;
    if (!color) {
        colorPreviewEl.style.background = DEFAULT_PREVIEW;
        colorPreviewEl.dataset.color = '';
        colorPreviewEl.title = 'Default';
        return;
    }
    colorPreviewEl.style.background = color;
    colorPreviewEl.dataset.color = color;
    colorPreviewEl.title = color;
}

function setColorPickerOpen(open) {
    if (!colorPickerPanel || !colorPreviewEl) return;
    colorPickerPanel.classList.toggle('hidden', !open);
    colorPreviewEl.classList.toggle('is-open', open);
    colorPreviewEl.setAttribute('aria-expanded', String(open));
}

/** Native color inputs are expensive — create only when the user picks custom. */
function ensureCustomColorInput() {
    if (customColorEl) return customColorEl;
    const input = document.createElement('input');
    input.type = 'color';
    input.id = 'customColor';
    input.value =
        (settingsCache && settingsCache.completedColor) || '#a6da58';
    input.addEventListener('input', () => {
        setActiveSwatch('__custom__');
        if (customSwatchEl) customSwatchEl.style.background = input.value;
        setColorPreview(input.value);
        setColorPickerOpen(false);
        debounce(
            'completedColor',
            () => save({ completedColor: input.value }),
            800,
        );
    });
    customSwatchEl.appendChild(input);
    customColorEl = input;
    return input;
}

// ─── View navigation ──────────────────────────────────────────────────────────
const popupChrome = document.getElementById('popup-chrome');
const viewMain = document.getElementById('view-main');
const viewBadges = document.getElementById('view-badges');
const viewClipboard = document.getElementById('view-clipboard');
const tabSettings = document.getElementById('tab-settings');
const tabClipboard = document.getElementById('tab-clipboard');

let chipUiReady = false;
/** @type {object | null} */
let settingsCache = null;
/** @type {object[] | null} */
let allPacks = null;

function setTabActive(tab) {
    const isSettings = tab === tabSettings;
    tabSettings.classList.toggle('active', isSettings);
    tabClipboard.classList.toggle('active', !isSettings);
    tabSettings.setAttribute('aria-selected', String(isSettings));
    tabClipboard.setAttribute('aria-selected', String(!isSettings));
}

function showView(view) {
    const inBadges = view === viewBadges;
    popupChrome.classList.toggle('hidden', inBadges);
    viewMain.classList.toggle('hidden', view !== viewMain);
    viewBadges.classList.toggle('hidden', !inBadges);
    viewClipboard.classList.toggle('hidden', view !== viewClipboard);

    if (view === viewMain) setTabActive(tabSettings);
    if (view === viewClipboard) {
        setTabActive(tabClipboard);
        globalThis.PrestoPopupStaging?.onShow?.();
    }
    if (inBadges) {
        ensureChipUI().catch(console.error);
    }
}

tabSettings.addEventListener('click', () => showView(viewMain));
tabClipboard.addEventListener('click', () => showView(viewClipboard));

document.getElementById('btn-badges').addEventListener('click', () => {
    showView(viewBadges);
});
document.getElementById('btn-back').addEventListener('click', () => {
    showView(viewMain);
});

function setBadgesNavVisible(enabled) {
    badgesNavRowEl.classList.toggle('hidden', !enabled);
}

let saveTimer;
let debounceTimers = {};

function debounce(key, fn, delay = 400) {
    clearTimeout(debounceTimers[key]);
    debounceTimers[key] = setTimeout(fn, delay);
}

function showSaved() {
    savedEl.style.display = 'block';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        savedEl.style.display = 'none';
    }, 1500);
}

function save(partial) {
    chrome.storage.sync.get(DEFAULTS, (current) => {
        const next = Object.assign({}, current, partial);
        settingsCache = next;
        chrome.storage.sync.set(next, showSaved);
    });
}

function setActiveSwatch(color) {
    swatches.forEach((s) =>
        s.classList.toggle('active', s.dataset.color === color),
    );
}

function applyMainSettings(settings) {
    settingsCache = settings;
    noStrikethroughEl.checked = settings.noStrikethrough;
    showCheckIconEl.checked = settings.showCheckIcon;
    hideCommentsEl.checked = settings.hideComments;
    chipsEnabledEl.checked = settings.chipsEnabled;
    setBadgesNavVisible(settings.chipsEnabled);

    const color = settings.completedColor || '';
    setColorPreview(color);

    const swatchColors = Array.from(swatches).map((s) => s.dataset.color);
    if (swatchColors.includes(color)) {
        setActiveSwatch(color);
        if (color && customColorEl) customColorEl.value = color;
    } else if (color) {
        if (customSwatchEl) customSwatchEl.style.background = color;
        if (customColorEl) customColorEl.value = color;
        setActiveSwatch('__custom__');
    } else {
        setActiveSwatch('');
    }
}

// Single storage read for the settings tab — chip UI loads later
chrome.storage.sync.get(DEFAULTS, applyMainSettings);

// Defer non-critical work until after first paint
requestAnimationFrame(() => {
    if (versionEl) {
        versionEl.textContent = `v${chrome.runtime.getManifest().version}`;
    }
    const s = document.createElement('script');
    s.src = 'popup-staging.js';
    document.body.appendChild(s);
});

noStrikethroughEl.addEventListener('change', () => {
    save({ noStrikethrough: noStrikethroughEl.checked });
});

showCheckIconEl.addEventListener('change', () => {
    save({ showCheckIcon: showCheckIconEl.checked });
});

hideCommentsEl.addEventListener('change', () => {
    save({ hideComments: hideCommentsEl.checked });
});

colorPreviewEl?.addEventListener('click', () => {
    const open = colorPickerPanel?.classList.contains('hidden');
    setColorPickerOpen(!!open);
});

swatches.forEach((swatch) => {
    swatch.addEventListener('click', () => {
        if (swatch.dataset.color === '__custom__') {
            setActiveSwatch('__custom__');
            const input = ensureCustomColorInput();
            input.click();
            return;
        }
        const color = swatch.dataset.color || '';
        setActiveSwatch(color);
        setColorPreview(color);
        if (color && customColorEl) customColorEl.value = color;
        save({ completedColor: color });
        setColorPickerOpen(false);
    });
});

// ─── Chip pack UI (lazy — only when Status badges view opens) ─────────────────

async function loadPacks() {
    if (allPacks) return allPacks;
    const url = chrome.runtime.getURL('chips.json');
    const res = await fetch(url);
    const data = await res.json();
    allPacks = data.packs;
    return allPacks;
}

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function renderChipList(pack, chipColors) {
    chipListEl.replaceChildren();

    const frag = document.createDocumentFragment();
    for (const chip of pack.chips) {
        const color = chipColors[chip.label] || chip.color;

        const row = document.createElement('div');
        row.className = 'chip-list-row';

        const preview = document.createElement('span');
        preview.className = 'chip-preview';
        preview.style.background = hexToRgba(color, 0.15);
        preview.style.color = color;
        preview.textContent = chip.label;

        const colorBtn = document.createElement('label');
        colorBtn.className = 'chip-color-btn';
        colorBtn.style.background = color;
        colorBtn.title = 'Change color';

        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = color;
        colorBtn.appendChild(colorInput);

        const resetBtn = document.createElement('button');
        resetBtn.className = 'chip-reset';
        resetBtn.textContent = 'Reset';
        resetBtn.title = 'Reset to default';

        colorInput.addEventListener('input', () => {
            const newColor = colorInput.value;
            preview.style.background = hexToRgba(newColor, 0.15);
            preview.style.color = newColor;
            colorBtn.style.background = newColor;
            debounce(
                `chip-${chip.label}`,
                () => {
                    chrome.storage.sync.get(DEFAULTS, (current) => {
                        const colors = Object.assign(
                            {},
                            current.chipColors || {},
                            { [chip.label]: newColor },
                        );
                        const next = Object.assign({}, current, {
                            chipColors: colors,
                        });
                        settingsCache = next;
                        chrome.storage.sync.set(next, showSaved);
                    });
                },
                800,
            );
        });

        resetBtn.addEventListener('click', () => {
            chrome.storage.sync.get(DEFAULTS, (current) => {
                const colors = Object.assign({}, current.chipColors);
                delete colors[chip.label];
                const next = Object.assign({}, current, { chipColors: colors });
                settingsCache = next;
                chrome.storage.sync.set(next, showSaved);
                preview.style.background = hexToRgba(chip.color, 0.15);
                preview.style.color = chip.color;
                colorBtn.style.background = chip.color;
                colorInput.value = chip.color;
            });
        });

        row.appendChild(preview);
        row.appendChild(colorBtn);
        row.appendChild(resetBtn);
        frag.appendChild(row);
    }
    chipListEl.appendChild(frag);
}

function populatePackSelect(packs, activePackId) {
    chipPackEl.replaceChildren();
    const frag = document.createDocumentFragment();
    for (const pack of packs) {
        const opt = document.createElement('option');
        opt.value = pack.id;
        opt.textContent = pack.name;
        if (pack.id === activePackId) opt.selected = true;
        frag.appendChild(opt);
    }
    chipPackEl.appendChild(frag);
}

function setColorBadgesVisible(enabled) {
    colorBadgesSectionEl.classList.toggle('hidden', !enabled);
}

async function ensureChipUI() {
    if (chipUiReady) return;
    chipUiReady = true;

    const settings =
        settingsCache ||
        (await new Promise((resolve) =>
            chrome.storage.sync.get(DEFAULTS, resolve),
        ));
    settingsCache = settings;

    const packs = await loadPacks();
    populatePackSelect(packs, settings.activeChipPack);
    chipColorsEl.checked = settings.chipColorsEnabled;

    const pack =
        packs.find((p) => p.id === settings.activeChipPack) || packs[0];
    renderChipList(pack, settings.chipColors || {});
    setColorBadgesVisible(settings.chipColorsEnabled);
}

chipsEnabledEl.addEventListener('change', () => {
    const enabled = chipsEnabledEl.checked;
    save({ chipsEnabled: enabled });
    setBadgesNavVisible(enabled);
});

chipColorsEl.addEventListener('change', () => {
    const enabled = chipColorsEl.checked;
    save({ chipColorsEnabled: enabled });
    setColorBadgesVisible(enabled);
});

chipPackEl.addEventListener('change', () => {
    const packId = chipPackEl.value;
    chrome.storage.sync.get(DEFAULTS, (current) => {
        const next = Object.assign({}, current, { activeChipPack: packId });
        settingsCache = next;
        chrome.storage.sync.set(next, showSaved);
        const pack = (allPacks || []).find((p) => p.id === packId) || allPacks?.[0];
        if (pack) renderChipList(pack, current.chipColors || {});
    });
});
