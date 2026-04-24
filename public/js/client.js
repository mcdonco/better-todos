/* global TrelloPowerUp */

TrelloPowerUp.initialize(
    {
        'board-buttons': function () {
            return [{
                text: '✓ Better Todos',
                condition: 'always',
                callback: function (t) {
                    return t.alert({
                        message: 'Better Todos is active — strikethrough on completed checklist items is disabled.',
                        duration: 5,
                    });
                },
            }];
        },
    },
    {
        appName: 'Better Todos',
        // The stylesheet URL is injected by Trello into the board page so that
        // the CSS rules apply to native Trello UI elements (e.g. checklist items).
        // Must be an absolute URL — relative paths resolve against trello.com, not this host.
        stylesheet: window.location.origin + '/css/no-strikethrough.css',
    },
);
