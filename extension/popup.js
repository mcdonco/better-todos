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
const customColorEl = document.getElementById('customColor');
const swatches = document.querySelectorAll('.swatch');
const savedEl = document.getElementById('saved');
const badgesNavRowEl = document.getElementById('badgesNavRow');

// ─── View navigation ──────────────────────────────────────────────────────────
const viewMain = document.getElementById('view-main');
const viewBadges = document.getElementById('view-badges');
document.getElementById('btn-badges').addEventListener('click', () => {
    viewMain.classList.add('hidden');
    viewBadges.classList.remove('hidden');
});
document.getElementById('btn-back').addEventListener('click', () => {
    viewBadges.classList.add('hidden');
    viewMain.classList.remove('hidden');
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
        chrome.storage.sync.set(next, showSaved);
    });
}

function setActiveSwatch(color) {
    swatches.forEach((s) =>
        s.classList.toggle('active', s.dataset.color === color),
    );
}

// Load saved settings and populate UI
chrome.storage.sync.get(DEFAULTS, (settings) => {
    noStrikethroughEl.checked = settings.noStrikethrough;
    showCheckIconEl.checked = settings.showCheckIcon;
    hideCommentsEl.checked = settings.hideComments;
    chipsEnabledEl.checked = settings.chipsEnabled;
    setBadgesNavVisible(settings.chipsEnabled);

    // Check if color matches a swatch, otherwise treat as custom
    const swatchColors = Array.from(swatches).map((s) => s.dataset.color);
    if (swatchColors.includes(settings.completedColor)) {
        setActiveSwatch(settings.completedColor);
        if (settings.completedColor)
            customColorEl.value = settings.completedColor;
    } else if (settings.completedColor) {
        customColorEl.value = settings.completedColor;
        setActiveSwatch('__custom__'); // none of the swatches
    } else {
        setActiveSwatch('');
    }
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

swatches.forEach((swatch) => {
    swatch.addEventListener('click', () => {
        if (swatch.dataset.color === '__custom__') {
            // Visual-only — the native <label> forwards the click to the color
            // input, which fires 'input' and handles saving.
            setActiveSwatch('__custom__');
            return;
        }
        setActiveSwatch(swatch.dataset.color);
        if (swatch.dataset.color) customColorEl.value = swatch.dataset.color;
        save({ completedColor: swatch.dataset.color });
    });
});

customColorEl.addEventListener('input', () => {
    setActiveSwatch('__custom__');
    debounce(
        'completedColor',
        () => save({ completedColor: customColorEl.value }),
        800,
    );
});

// ─── Chip pack UI ─────────────────────────────────────────────────────────────

const chipsEnabledEl = document.getElementById('chipsEnabled');
const chipColorsEl = document.getElementById('chipColorsEnabled');
const chipPackEl = document.getElementById('chipPack');
const chipListEl = document.getElementById('chipList');

let allPacks = [];
let cachedPacks = null;

async function loadPacks() {
    if (cachedPacks) return cachedPacks;
    const url = chrome.runtime.getURL('chips.json');
    const res = await fetch(url);
    const data = await res.json();
    cachedPacks = data.packs;
    return cachedPacks;
}

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function renderChipList(pack, chipColors) {
    chipListEl.innerHTML = '';

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
                    // Read once, merge, write once — avoids double-get that can
                    // push past the MAX_WRITE_OPERATIONS_PER_MINUTE quota.
                    chrome.storage.sync.get(DEFAULTS, (current) => {
                        const colors = Object.assign(
                            {},
                            current.chipColors || {},
                            {
                                [chip.label]: newColor,
                            },
                        );
                        const next = Object.assign({}, current, {
                            chipColors: colors,
                        });
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
        chipListEl.appendChild(row);
    }
}

function populatePackSelect(packs, activePackId) {
    chipPackEl.innerHTML = '';
    for (const pack of packs) {
        const opt = document.createElement('option');
        opt.value = pack.id;
        opt.textContent = pack.name;
        if (pack.id === activePackId) opt.selected = true;
        chipPackEl.appendChild(opt);
    }
}

const colorBadgesSectionEl = document.getElementById('colorBadgesSection');

function setColorBadgesVisible(enabled) {
    colorBadgesSectionEl.classList.toggle('hidden', !enabled);
}

async function initChipUI(settings) {
    allPacks = await loadPacks();
    populatePackSelect(allPacks, settings.activeChipPack);
    chipColorsEl.checked = settings.chipColorsEnabled;

    const pack =
        allPacks.find((p) => p.id === settings.activeChipPack) || allPacks[0];
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
    // Single read → merge → write, then render with same data (avoids double read).
    chrome.storage.sync.get(DEFAULTS, (current) => {
        const next = Object.assign({}, current, { activeChipPack: packId });
        chrome.storage.sync.set(next, showSaved);
        const pack = allPacks.find((p) => p.id === packId) || allPacks[0];
        renderChipList(pack, current.chipColors || {});
    });
});

chrome.storage.sync.get(DEFAULTS, (settings) =>
    initChipUI(settings).catch(console.error),
);
