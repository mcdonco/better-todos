(() => {
    'use strict';

    const STACK_ID = 'pt-toast-stack';
    const STICKY_ID = 'pt-toast-sticky';
    const FLASH_ID = 'pt-toast-flash';
    const FLASH_MS = 1600;

    /** @type {{ message: string, onClear: Function | null } | null} */
    let sticky = null;
    let flashTimer = 0;
    let stickyMessage = '';
    let flashMessage = '';
    let guardInstalled = false;
    /** @type {HTMLElement | null} */
    let stackEl = null;
    /** @type {HTMLElement | null} */
    let stickyEl = null;
    /** @type {HTMLElement | null} */
    let flashEl = null;

    function stackInteractive() {
        return !!(
            stickyEl?.classList.contains('pt-toast-visible') ||
            flashEl?.classList.contains('pt-toast-visible')
        );
    }

    /**
     * Toast lives on document.body so it survives closing the card.
     * Capture-phase guard stops Trello treating toast clicks as “outside”.
     */
    function installOutsideClickGuard() {
        if (guardInstalled) return;
        guardInstalled = true;

        const guard = (e) => {
            if (!stackInteractive() || !stackEl) return;
            if (!stackEl.contains(e.target)) return;
            e.stopImmediatePropagation();
            if (
                e.type === 'pointerdown' &&
                e.target.closest?.('.pt-toast-clear')
            ) {
                sticky?.onClear?.();
            }
        };

        for (const type of [
            'pointerdown',
            'mousedown',
            'mouseup',
            'click',
            'touchstart',
        ]) {
            document.addEventListener(type, guard, true);
        }
    }

    installOutsideClickGuard();

    function ensureStack() {
        if (stackEl?.isConnected && stickyEl?.isConnected && flashEl?.isConnected) {
            return stackEl;
        }

        if (!document.body) return null;

        let stack = document.getElementById(STACK_ID);
        if (!stack) {
            stack = document.createElement('div');
            stack.id = STACK_ID;
            stack.className = 'pt-toast-stack';
            stack.setAttribute('data-no-focus-lock', 'true');
        }

        let stickyNode = document.getElementById(STICKY_ID);
        if (!stickyNode) {
            stickyNode = document.createElement('div');
            stickyNode.id = STICKY_ID;
            stickyNode.className = 'pt-toast';
            stickyNode.setAttribute('role', 'status');
        }

        let flashNode = document.getElementById(FLASH_ID);
        if (!flashNode) {
            flashNode = document.createElement('div');
            flashNode.id = FLASH_ID;
            flashNode.className = 'pt-toast';
            flashNode.setAttribute('role', 'status');
        }

        // Sticky on top, flash beneath
        if (stickyNode.parentElement !== stack) stack.appendChild(stickyNode);
        if (flashNode.parentElement !== stack) stack.appendChild(flashNode);
        if (stack.parentElement !== document.body) {
            document.body.appendChild(stack);
        }

        // Order: sticky first (top), flash second (below)
        if (stack.firstElementChild !== stickyNode) {
            stack.insertBefore(stickyNode, stack.firstChild);
        }

        stackEl = stack;
        stickyEl = stickyNode;
        flashEl = flashNode;
        return stack;
    }

    function paintSticky(message, onClear) {
        const el = stickyEl;
        if (!el) return;

        if (
            stickyMessage === message &&
            el.classList.contains('pt-toast-visible')
        ) {
            if (sticky) sticky.onClear = onClear || sticky.onClear;
            return;
        }

        el.replaceChildren();
        const text = document.createElement('span');
        text.className = 'pt-toast-text';
        text.textContent = message;
        el.appendChild(text);

        if (onClear) {
            const clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'pt-toast-clear';
            clearBtn.textContent = 'Clear';
            clearBtn.title = 'Clear Presto clipboard';
            el.appendChild(clearBtn);
        }

        el.classList.add('pt-toast-visible');
        stickyMessage = message;
    }

    function hideStickyVisual() {
        stickyEl?.classList.remove('pt-toast-visible');
        stickyMessage = '';
        if (stickyEl) stickyEl.replaceChildren();
    }

    function paintFlash(message) {
        const el = flashEl;
        if (!el) return;

        el.replaceChildren();
        const text = document.createElement('span');
        text.className = 'pt-toast-text';
        text.textContent = message;
        el.appendChild(text);
        el.classList.add('pt-toast-visible');
        flashMessage = message;
    }

    function hideFlashVisual() {
        clearTimeout(flashTimer);
        flashTimer = 0;
        flashEl?.classList.remove('pt-toast-visible');
        flashMessage = '';
        if (flashEl) flashEl.replaceChildren();
    }

    function hide() {
        sticky = null;
        hideStickyVisual();
        hideFlashVisual();
    }

    function dismissSticky() {
        sticky = null;
        hideStickyVisual();
    }

    /**
     * @param {string} message
     * @param {{ persistent?: boolean, onClear?: () => void }} [options]
     */
    function show(message, options = {}) {
        const { persistent = false, onClear = null } = options;

        if (!document.body) {
            document.addEventListener(
                'DOMContentLoaded',
                () => show(message, options),
                { once: true },
            );
            return;
        }

        ensureStack();

        if (persistent) {
            sticky = { message, onClear };
            paintSticky(message, onClear);
            return;
        }

        // Flash sits under the sticky count toast — count never leaves
        paintFlash(message);
        clearTimeout(flashTimer);
        flashTimer = setTimeout(hideFlashVisual, FLASH_MS);
    }

    globalThis.PrestoToast = { show, hide, dismissSticky };
})();
