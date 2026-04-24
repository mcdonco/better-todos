const DEFAULTS = {
    noStrikethrough: true,
    showCheckIcon: true,
    completedColor: '#94c748',
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
        save({ completedColor: swatch.dataset.color });
    });
});

customColorEl.addEventListener('input', () => {
    setActiveSwatch('__custom__');
    save({ completedColor: customColorEl.value });
});
