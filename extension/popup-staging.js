(() => {
    'use strict';

    const STORAGE_KEY = 'prestoStagedItems';

    const listEl = document.getElementById('pt-staged-list');
    const emptyEl = document.getElementById('pt-staged-empty');
    const clearBtn = document.getElementById('pt-staged-clear');
    const countEl = document.getElementById('pt-staged-count');
    const viewClipboard = document.getElementById('view-clipboard');

    if (!listEl || !clearBtn) return;

    /** @type {string[]} */
    let cachedItems = [];
    let listBuilt = false;

    function clipboardVisible() {
        return !!viewClipboard && !viewClipboard.classList.contains('hidden');
    }

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
        return new Promise((resolve) => {
            chrome.storage.local.set({ [STORAGE_KEY]: items }, resolve);
        });
    }

    async function removeAt(index) {
        const items = cachedItems.slice();
        items.splice(index, 1);
        cachedItems = items;
        await setTray(items);
        render(items, true);
    }

    async function clearAll() {
        cachedItems = [];
        await setTray([]);
        render([], true);
    }

    function updateCount(n) {
        if (!countEl) return;
        countEl.textContent = n ? String(n) : '';
        countEl.hidden = n === 0;
        countEl.classList.toggle('hidden', n === 0);
    }

    function renderList(items) {
        listEl.replaceChildren();
        const frag = document.createDocumentFragment();

        items.forEach((text, index) => {
            const row = document.createElement('div');
            row.className = 'pt-staged-row';

            const label = document.createElement('span');
            label.className = 'pt-staged-text';
            label.textContent = text;
            label.title = text;

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'pt-staged-remove';
            remove.title = 'Remove';
            remove.setAttribute('aria-label', 'Remove staged item');
            remove.textContent = '✕';
            remove.addEventListener('click', () => {
                removeAt(index).catch(console.error);
            });

            row.appendChild(label);
            row.appendChild(remove);
            frag.appendChild(row);
        });

        listEl.appendChild(frag);
        listBuilt = true;
    }

    /**
     * @param {string[]} items
     * @param {boolean} [forceList] build rows even if tab is hidden
     */
    function render(items, forceList = false) {
        cachedItems = Array.isArray(items) ? items : [];
        const n = cachedItems.length;

        updateCount(n);

        if (emptyEl) emptyEl.classList.toggle('hidden', n > 0);
        listEl.classList.toggle('hidden', n === 0);
        clearBtn.disabled = n === 0;
        clearBtn.classList.toggle('hidden', n === 0);

        // Defer heavy row DOM until Clipboard tab is shown
        if (!forceList && !clipboardVisible()) {
            listBuilt = false;
            return;
        }

        renderList(cachedItems);
    }

    clearBtn.addEventListener('click', () => {
        clearAll().catch(console.error);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        const next = changes[STORAGE_KEY].newValue;
        render(Array.isArray(next) ? next : [], clipboardVisible());
    });

    globalThis.PrestoPopupStaging = {
        onShow() {
            if (!listBuilt) render(cachedItems, true);
        },
    };

    // After paint — count only; list waits for Clipboard tab
    requestAnimationFrame(() => {
        getTray()
            .then((items) => render(items, false))
            .catch(console.error);
    });
})();
