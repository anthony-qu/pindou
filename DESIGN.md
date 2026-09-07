# Pindou — image to Mard bead chart

Converts an image into a pixel-bead (拼豆 / perler) template using the Mard 291-color palette,
and displays it as a zoomable grid where every cell shows its bead code.

Status: design agreed, not yet built. See ROADMAP.md for deferred features.

---

## 1. Architecture

**Everything runs in the browser. There is no server.**

The whole pipeline — decode image, downsample to a grid, match each cell against 291 colors,
draw the result — is milliseconds of work on a canvas. A backend would add hosting cost, upload
latency, and responsibility for other people's photos, and buy nothing.

Consequences, accepted deliberately:

- The site is static files. Free hosting, no database, no accounts, no server maintenance.
- No image ever leaves the user's device. This is a real privacy feature worth stating in the UI.
- The palette ships inside the app. Updating it means editing a file and redeploying.
  Fine, because the Mard 291 chart is fixed and will not change.
- Saved projects live in the user's own browser (see ROADMAP R5). Same-device by design.

## 2. Stack

- Vite + React + TypeScript
- Grid rendered to `<canvas>`, not DOM. At 104x104 that is 10,816 cells; DOM would crawl.
- i18n (English / Chinese) with a switch, wired in from the first commit.
  Retrofitting translation into a finished UI is far more painful than building with it.
- Deployed to a free static host (Cloudflare Pages or Netlify) from a GitHub repo.
  Public URL, intended for strangers to use, not just the author.

## 3. Palette data

Source: https://www.pixel-beads.com/zh/mard-bead-color-chart — 291 colors, hex values inline.

Scraped **once** into `src/data/mard-palette.json`, committed to the repo. Never fetched at runtime.

Series: A1–A26, B1–B32, C1–C29, D1–D26, E1–E24, F1–F25, G1–G21, H1–H23, M1–M15,
plus extended series P, Q, R, T, Y, ZG.

Each entry: `{ code, hex, lab, series }`.

All 291 codes are used in matching. Specialty beads (glitter, glow, transparent) are not
distinguished — the chart is taken at face value. Decided 2026-09-06: not worth the effort of
classifying them, and their hex values are close enough in practice.

## 4. Output sizing

Preset square canvases only: **52x52, 78x78, 104x104**.

Output preserves the input aspect ratio and fits inside the chosen square as large as possible
(letterbox — no cropping in v1). A 4:3 photo at 78 becomes 78x58.

## 4b. Gridlines

The chart draws counting gridlines so you can find your place:

- **dashed line every 5 cells**
- **solid line every 10 cells**

These appear on the **final chart output only** — the intermediate pixelated preview stays clean,
so you can judge the image itself without a grid over it.

## 5. Pipeline

Two cleanly separated stages, and the separation is the important part:

    image ──▶ [A] downsample to WxH grid of true colors ──▶ [B] match each cell to a Mard code ──▶ render
                   (expensive, runs once)                      (cheap, re-runs freely)

Stage A is cached. Stage B is 291 distance comparisons per cell — about 3M for the largest canvas,
which is a few milliseconds. So changing the palette constraints (inventory, specialty toggle,
color simplification) re-colors the entire chart instantly with no re-upload and no re-read of the image.

**Stage A — downsample.** Two methods, user-switchable:
- *Average* (default): mean of the source pixels under each cell. Correct for photos.
- *Sharp*: most common color under each cell. Correct for anime, logos, sprites — averaging
  smears their outlines into halos.

**Stage B — match.** Nearest palette color by **CIEDE2000 in CIELAB**, not RGB.
RGB nearest-neighbour makes visibly wrong choices on skin tones and greens.

## 6. Display

- Canvas grid, pan and zoom, **pinch-zoom and touch panning on mobile**.
- Bead codes fade in above the zoom level where they would actually be legible.
  Codes and the whole picture cannot be visible simultaneously — that is a screen-size limit,
  not a design choice.
- Counting gridlines: dashed every 5, solid every 10 (chart view only).
- Bead count list: swatch, code, count, sorted by count descending.
- Phone is a first-class target: the author intends to bead with the phone next to the board.

## 7. v1 scope

Upload → pick canvas size → downsample (average/sharp) → match to Mard → zoomable grid with
codes → bead count list. Bilingual. Deployed.

Nothing else. Everything in ROADMAP.md is additive and does not require revisiting these decisions.
