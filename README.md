# Vice Cover Studio

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/aldi235/gta6-cover-art-01/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/aldi235/gta6-cover-art-01/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

An offline web app that turns your own photos and a caption into GTA-style
multi-panel cover art, exported as a PNG to share. Built for the
[make.fun bounty "Make GTA 6 Cover Art"](https://make.fun/c/gta6-cover-art-01)
(`gta6-cover-art-01`).

## What it does

- **Three layouts** — Vice Grid (hero panel + two stacked panels), Triptych
  (three equal columns) and Hero Shot (one photo, full-bleed).
- **Three post sizes** — 1080 × 1080, 1080 × 1350 and 1920 × 1080.
- **Four colour grades** — Vice Sunset, Neon Night, Palm Noir and Pastel
  Miami, each with vignette and seeded film grain.
- **Any photo** — upload your own per panel, or use the three built-in
  sample scenes (drawn in code). Click a panel to pick it, drag its photo
  to reframe it, scroll to zoom, or drop an image file straight onto a
  panel. "One photo in every panel" fills all three panels from the first.
- **Bold poster lettering** — an auto-fitting title (one or two lines, so
  descenders never touch the tagline) and a letterspaced tagline, set in a
  vendored OFL typeface.
- **One-click PNG export** at the chosen size.

Everything runs offline in the browser from static files under `app/` — no
build step, no network request, and photos are read on your machine, never
uploaded.

## Try it

```sh
node serve.ts
```

then open http://localhost:8080. (Node 22 or later.)

## Layout of this repo

- `app/` — the web app: `index.html`, `style.css`, `src/cover.js` (the
  cover engine), `src/main.js` (the editor wiring), `src/shots.js` (fixed
  scenes for screenshots), `fonts/` (the OFL poster typeface) and
  `samples/` (three scenes drawn in code).
- `screenshots/` — four screenshots: the exported covers and the editor
  with a photo loaded.
- `main.ts` — the entry program: copies `app/` and `screenshots/` to
  `/output` and writes `dossier.json`.
- `serve.ts` — a tiny static server for local testing.
- `shots.json` — the four screenshot scenes (query + viewport each).
- `vendor/makefun-app.ts` — the kit's dossier library, unchanged.

## Originality

No Rockstar Games logo, wordmark, artwork, character or font is used
anywhere. The poster typeface is Noto Sans Display ExtraCondensed Black
under the SIL Open Font License (see `app/fonts/README.txt`); the sample
scenes are original illustrations drawn in code; every line of the app is
written for this entry.

## License

MIT — see [LICENSE](LICENSE).

Built by @zeec — https://make.fun/r/7awpzphz
