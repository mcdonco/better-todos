# Better Todos — Trello Power-Up

Removes the strikethrough styling from completed checklist items on Trello cards.

## How it works

The Power-Up uses the `stylesheet` option in `TrelloPowerUp.initialize()`. Trello injects the specified CSS file directly into the board page, letting the rules override native Trello styles — no capabilities or API keys required.

## Project structure

```
trello-better-todos/
├── server.js               # Express server (serves public/ + connector HTML)
├── package.json
├── views/
│   └── index.html          # Power-Up connector (hidden iframe loaded by Trello)
└── public/
    ├── js/
    │   └── client.js       # TrelloPowerUp.initialize() call
    └── css/
        └── no-strikethrough.css  # CSS injected into the Trello board page
```

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Run locally

```bash
npm start
```

The server listens on port 3000 by default (or `$PORT` if set).

To expose it for local testing you can use a tunnel like [ngrok](https://ngrok.com/):

```bash
ngrok http 3000
```

### 3. Register the Power-Up with Trello

1. Go to <https://trello.com/power-ups/admin> and click **Create new Power-Up**.
2. Fill in the name (e.g. "Better Todos") and set the **Connector URL** to your public URL, e.g. `https://your-ngrok-url.ngrok.io`.
3. Click **Save**.
4. Enable the Power-Up on a board: open the board → **Power-Ups** → find "Better Todos" under *Custom* → **Add**.

Completed checklist items will no longer display a strikethrough.

## Adjusting the CSS

If Trello updates its class names, inspect a completed checklist item in DevTools and update the selectors in [`public/css/no-strikethrough.css`](public/css/no-strikethrough.css) accordingly.

## Deploying

You can host this on any Node.js platform (Heroku, Glitch, Render, Railway, etc.). Set the `PORT` environment variable if required by the platform, and update the Connector URL in the Power-Up admin to your production URL.
