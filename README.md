# EV over Trade Sessions

A dashboard for running random trading experiments across BTC/USD, ETH/USD, and SOL/USD. It includes price charts, trade result tables, expected-value tables by weekday and market session, and run charts.

## Requirements

- Node.js 20.9.0 or later
- npm

## Install and run locally

From the project directory, install the locked dependencies and start the development server:

```bash
npm i
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. Stop the server with `Ctrl+C`.

## Production build

```bash
npm i
npm run build
npm run start
```

The production server runs at [http://localhost:3000](http://localhost:3000).

## Available scripts

- `npm run dev` — start the local development server.
- `npm run build` — build the production app.
- `npm run start` — serve the production build.

Market data is stored in `public/data/`; the experiment uses the included five-minute OHLCV files.
