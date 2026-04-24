const STYLE_ID = 'better-todos-styles';

const SELECTOR_DIV =
    '[data-testid="check-item-container"]:has(input[aria-checked="true"]) [data-testid="check-item-name"] > div > div';
const SELECTOR_P =
    '[data-testid="check-item-container"]:has(input[aria-checked="true"]) [data-testid="check-item-name"] p';

const DEFAULTS = {
    noStrikethrough: true,
    showCheckIcon: true,
    completedColor: '#94c748',
};

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

// Load settings and apply on page load
chrome.storage.sync.get(DEFAULTS, applyStyles);

// Re-apply whenever settings change (popup saves)
chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === 'sync') {
        chrome.storage.sync.get(DEFAULTS, applyStyles);
    }
});
