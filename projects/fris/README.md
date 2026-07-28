# FRIS -- Browser-Only Build

The complete Forensic & Regulatory Intelligence Suite running **entirely in the
browser** -- no server, no database engine, no installation. All four modules,
every visualisation, the peel-chain simulator, the live waterfall and the
compliance sandbox run client-side using the same pure analysis engines as the
full app, over an embedded snapshot of the synthetic dataset (`data.json`).

> Regulatory Horizon is built on 47 real, publicly-sourced instruments (each links
> to its official source). The Nexus, Chain-Link and Waterfall data is synthetic
> demonstration data -- nothing there represents a real party.

## Two ways to run it

### 1. Single file -- zero install (easiest)
Double-click **`FRIS-Standalone.html`**. It contains the entire app and data in
one file and opens directly in any modern browser (Chrome, Edge, Firefox, Safari).
Nothing to install; works offline. This is also the file to drop onto a website
or share.

### 2. Multi-file build -- for hosting / development
The multi-file version (`index.html` + `browser-api.js` + `engines/` + `data.json`)
must be served over HTTP (browsers block a page from `fetch`-ing local files over
`file://`). Easiest local preview:

- **Any OS:** `node serve.mjs` (a tiny zero-dependency static server), then open the
  URL it prints.
- **Windows:** double-click `Open-Browser-Windows.bat`
- **macOS:** double-click `Open-Browser-Mac.command`
- **Linux:** `./open-browser-linux.sh`

Each launcher starts `serve.mjs` (needs Node.js) and opens your browser.

## Put it on your website (proof of concept)

- **Simplest:** upload `FRIS-Standalone.html` anywhere (even a static host or your
  CMS media library) and link to it, or embed it in an `<iframe>`.
- **Multi-file:** upload the whole folder to any static host (Netlify, Vercel,
  GitHub Pages, S3, or a normal web server). No backend required.

## How it works

`browser-api.js` patches `window.fetch`: any request to `/api/*` is answered
in-memory from `data.json` + the engines in `engines/`, so the exact same UI code
(`app.js`, `core.js`, `viz.js`, `graph.js`, `views0.js`, `views1.js`, `views2.js`)
that talks to the Node server also runs unchanged here. Session edits (notes, saved
traces, scenarios, imports) live in memory; the "Reset demonstration data" action
restores the original snapshot. To refresh the snapshot from the full app, run
`npm run export-web-data` there and copy the new `data.json` in.

## Verify

`node verify-browser.mjs` runs a headless check: it renders all 18 views and runs
the 8 critical workflows against the in-browser API. Latest run: **18/18 . 8/8 . PASS.**
