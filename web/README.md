# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## Using your own data

1. Replace the files in `public/data/` (`cube.json`, `dq.json`, `anomalies.json`, `backtest.json`, `insights.json`, `stockouts.json`, `lifecycle.json`, `profile.json`, `exceptions.json`, `meta.json`, `submission.csv`) with your real outputs, keeping the same names and shape.
2. Optionally edit `public/data/config.json` to change the brand name, starting tab, light/dark default, colours (any CSS colour per token, e.g. `"history"`, `"forecast"`, `"band"`, `"chart-1"`), animation speed, filter labels, and the what-if / exception defaults. Any key you leave out keeps its default.

No code changes are needed; every number, date range and horizon is read from these files.

---
## How this app is wired to the pipeline
- Built with Lovable (TanStack Start + React + Recharts + Tailwind). It reads only `public/data/*.json` + `config.json`.
- `public/data` is written by the Python pipeline: from the repo root run `make all` (or `make export`). Never edit those JSON files by hand.
- Run locally: `cd web && npm install --legacy-peer-deps && npm run dev` (open the printed URL). `npm run build` for a production build, `npx vitest run` for the UI tests.
- `meta.sample_data` is `false` in the exported data (the original Lovable sample data was replaced with the real pipeline outputs).
