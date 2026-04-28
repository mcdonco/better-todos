const DEFAULTS = {
    noStrikethrough: true,
    showCheckIcon: true,
    completedColor: '#a6da58',
    chipsEnabled: true,
    activeChipPack: 'qa',
    chipColors: {},
};

const noStrikethroughEl = document.getElementById('noStrikethrough');
const showCheckIconEl = document.getElementById('showCheckIcon');
const customColorEl = document.getElementById('customColor');
const swatches = document.querySelectorAll('.swatch');
const savedEl = document.getElementById('saved');

let saveTimer;

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

swatches.forEach((swatch) => {
    swatch.addEventListener('click', () => {
        setActiveSwatch(swatch.dataset.color);
        if (swatch.dataset.color) customColorEl.value = swatch.dataset.color;
        save({ completedColor: swatch.dataset.color });
    });
});

customColorEl.addEventListener('input', () => {
    setActiveSwatch('__custom__');
    save({ completedColor: customColorEl.value });
});

// ─── Chip pack UI ─────────────────────────────────────────────────────────────

const chipsEnabledEl = document.getElementById('chipsEnabled');
const chipPackEl = document.getElementById('chipPack');
const chipListEl = document.getElementById('chipList');

let allPacks = [];

async function loadPacks() {
    const url = chrome.runtime.getURL('chips.json');
    const res = await fetch(url);
    const data = await res.json();
    return data.packs;
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
            chrome.storage.sync.get(DEFAULTS, (current) => {
                const colors = Object.assign({}, current.chipColors, {
                    [chip.label]: newColor,
                });
                save({ chipColors: colors });
            });
        });

        resetBtn.addEventListener('click', () => {
            chrome.storage.sync.get(DEFAULTS, (current) => {
                const colors = Object.assign({}, current.chipColors);
                delete colors[chip.label];
                save({ chipColors: colors });
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

async function initChipUI(settings) {
    allPacks = await loadPacks();
    populatePackSelect(allPacks, settings.activeChipPack);
    chipsEnabledEl.checked = settings.chipsEnabled;

    const pack =
        allPacks.find((p) => p.id === settings.activeChipPack) || allPacks[0];
    renderChipList(pack, settings.chipColors || {});

    chipListEl.style.opacity = settings.chipsEnabled ? '1' : '0.4';
    chipListEl.style.pointerEvents = settings.chipsEnabled ? '' : 'none';
    chipPackEl.disabled = !settings.chipsEnabled;
}

chipsEnabledEl.addEventListener('change', () => {
    const enabled = chipsEnabledEl.checked;
    save({ chipsEnabled: enabled });
    chipListEl.style.opacity = enabled ? '1' : '0.4';
    chipListEl.style.pointerEvents = enabled ? '' : 'none';
    chipPackEl.disabled = !enabled;
});

chipPackEl.addEventListener('change', () => {
    const packId = chipPackEl.value;
    save({ activeChipPack: packId });
    chrome.storage.sync.get(DEFAULTS, (settings) => {
        const pack = allPacks.find((p) => p.id === packId) || allPacks[0];
        renderChipList(pack, settings.chipColors || {});
    });
});

chrome.storage.sync.get(DEFAULTS, initChipUI);
