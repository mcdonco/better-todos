(() => {
    'use strict';

    /** @type {Set<(mutations: MutationRecord[]) => void>} */
    const subscribers = new Set();
    /** @type {MutationObserver | null} */
    let cardObserver = null;
    /** @type {Element | null} */
    let observedRoot = null;

    const CARD_SELECTORS =
        '[data-testid="card-back-wrapper"], [data-testid="card-back"], [role="dialog"]';

    function queryCardEl() {
        return (
            document.querySelector(
                '[data-testid="card-back-wrapper"], [data-testid="card-back"]',
            ) || document.querySelector('[role="dialog"]')
        );
    }

    function findCardEl() {
        if (observedRoot?.isConnected) return observedRoot;
        return queryCardEl();
    }

    /** Cheap: pathname + cached root from retarget — no live DOM query. */
    function isCardContext() {
        return (
            /\/c\//.test(location.pathname) || !!(observedRoot?.isConnected)
        );
    }

    function cardRoot() {
        return findCardEl() || document;
    }

    function dispatch(mutations) {
        if (!subscribers.size) return;
        for (const fn of subscribers) {
            try {
                fn(mutations);
            } catch (err) {
                console.error('[Presto]', err);
            }
        }
    }

    /**
     * Observe only the open card. Idle (no observer) on the board view.
     * Call after SPA navigations — card chrome often mounts after the URL changes.
     */
    function retarget() {
        // Always live-query on retarget so we don't stick to a stale root
        const card = queryCardEl();
        if (card === observedRoot) {
            if (card && !cardObserver) attach(card);
            return !!card;
        }

        if (cardObserver) {
            cardObserver.disconnect();
            cardObserver = null;
        }
        observedRoot = card || null;

        if (!card) return false;
        attach(card);
        // Let features resync on the newly attached card
        dispatch([]);
        return true;
    }

    function attach(card) {
        if (cardObserver) cardObserver.disconnect();
        cardObserver = new MutationObserver(dispatch);
        cardObserver.observe(card, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['aria-checked'],
        });
    }

    function start() {
        retarget();
    }

    /**
     * @param {(mutations: MutationRecord[]) => void} fn
     * @returns {() => void} unsubscribe
     */
    function subscribe(fn) {
        subscribers.add(fn);
        start();
        return () => {
            subscribers.delete(fn);
        };
    }

    globalThis.PrestoDom = {
        subscribe,
        isCardContext,
        cardRoot,
        findCardEl,
        retarget,
        start,
        CARD_SELECTORS,
    };

    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
