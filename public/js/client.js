/* global TrelloPowerUp */

TrelloPowerUp.initialize(
    {
        // No capability handlers needed — this Power-Up only injects CSS via
        // the stylesheet option below to remove strikethrough on completed
        // checklist items. Add extra capability handlers here if you want to
        // extend the Power-Up later.
    },
    {
        appName: 'Better Todos',
        // The stylesheet URL is injected by Trello into the board page so that
        // the CSS rules apply to native Trello UI elements (e.g. checklist items).
        stylesheet: '/css/no-strikethrough.css',
    },
);
