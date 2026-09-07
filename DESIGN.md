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
Shortlisted by cheap squared Lab distance, then re-ranked with the accurate metric.

**Stage C — simplify.** Two independent operations on the matched chart, deliberately
not combined into one control, because they fix two different problems:

- *Colours slider* — agglomerative merging of the bead codes actually used. Merge cost is
  a Ward-style criterion: perceptual distance scaled by the harmonic size of the two
  groups, so near-identical codes and barely-used codes go first while a large block of a
  distinctive colour survives. The full merge order is computed once, so the slider is an
  index into it: every stop is exactly one merge, the count is exact and monotonic, and
  dragging back and forth is stable.
- *Tidy slider* — absorbs connected blobs below a size threshold into whatever surrounds
  them, using **8-connectivity** so a single-bead-wide diagonal line survives (under
  4-connectivity it would read as isolated dots and be destroyed).

Neither blurs. Flat areas and hard edges are untouched by both. Rejected alternatives and
why are recorded in ROADMAP.md under the shipped R1 entry.

## 6. Display

- Canvas grid, pan and zoom, **pinch-zoom and touch panning on mobile**.
- Bead codes fade in above the zoom level where they would actually be legible.
  Codes and the whole picture cannot be visible simultaneously — that is a screen-size limit,
  not a design choice.
- Counting gridlines: dashed every 5, solid every 10 (chart view only).
- Bead count list: swatch, code, count, sorted by count descending.
- Phone is a first-class target: the author intends to bead with the phone next to the board.

## 7. Colour isolation

Selecting a colour in the bead list fades everything else back and outlines the perimeter
of each cluster of that colour, so you can find every A18 at a glance.

Only the perimeter is outlined — the edges whose neighbour is a different colour. Boxing
each cell individually lays two lines side by side between adjacent highlighted cells and
reads as heavy black. It is gated at the same zoom as the ordinary per-cell gridlines so it
disappears on zoom out with them.

Tap-to-tick progress tracking was built and then removed: in practice you do not touch the
screen while your hands are busy placing beads.

## 8. Saved projects

localStorage, plus export/import of a `.pindou.json` file. Same-device by design.
Projects written by older versions still open — removed fields are simply ignored.
Stored source images are re-encoded at most 640px on the longest side — the grid is at most
104 cells, so more resolution buys nothing and it keeps roughly 90 projects inside the
storage budget. PNG where transparency must survive, JPEG otherwise.

Clearing site data loses saves. That is exactly why the export button is not optional.

## 9. Advanced settings

Seven conversion parameters behind an **Advanced** button, listed in the order the pipeline
applies them:

1. **Kernel shape** — box / tent / gaussian / mitchell / lanczos, weighting source pixels
   within a cell. Box is the original uniform weighting.
2. **Boundary handling** — snap (whole pixels per cell) or exact (edge pixels weighted by
   the fraction the cell actually covers).
3. **Alpha threshold** — coverage a cell needs to get a bead.
4. **Bin width** — Sharp's histogram bins, as bits per channel.
5. **Bin merging** — pools each bin with its neighbours before the winner is picked.
6. **Dominance threshold** — coverage the winner needs before Sharp trusts it.
7. **Bin refinement** — the winner's colour: the mean of its pixels, or the bin centre.

`box` + `snap` is a dedicated branch, so the default output is bit-identical to the original
integer tiling and is also the cheapest path. A test asserts it.

Five further parameters exist in the library at their defaults but are not exposed, having
been tried and found not worth a control: averaging colour space, source downscale filter
and working size, saturation boost, and grid phase. They stay covered by
`scripts/paramtest.ts`, so re-exposing one is a control, not a rewrite.

`scripts/paramtest.ts` measures every parameter, exposed or not. Findings worth keeping:

- **Kernel shape is a small effect here.** Any non-box kernel changes about 3.7% of cells on
  a photo, and costs up to 22x the time (1ms to 22ms), because the wider support pulls in
  many more source pixels. This matches the prediction: at a ~15:1 reduction the box filter
  is already the area average, which is near-ideal, so there is little for a better kernel
  to fix. It would matter more at low reduction ratios.
- **Boundary handling only matters under box.** Snap vs exact changes 3.1% of cells with the
  box kernel and **0.0%** with gaussian — a smooth kernel already tapers to near-zero at the
  support edge, so weighting the edge pixels by coverage changes nothing.
- **Bin merging can raise the colour count, not lower it.** On flat art it took 3 colours to
  7, because the winner's representative colour becomes the mean over the pooled group,
  which blends in the anti-aliased neighbours it merged. It helps photos (8.9% of cells
  change) and hurts flat art. It is a bin-splitting fix, not a cleanup knob.
- **Bin refinement is the strongest of the new controls.** Bin centre versus mean changes
  20.8% of cells at 4 bits and 48.8% at 3 bits, and at 3 bits it drops a photo from 125 to
  95 colours. Choosing the bin centre quantises output onto the bin grid, which is what
  makes the bin-width setting plainly visible.
- **Linear averaging remains the only physically correct choice** (rgb 188 on half-black,
  half-white cells against 128 for sRGB and 119 for Lab), and remains unexposed by request.
- **Sharp is phase-robust, Smooth is not:** on pixel art a half-cell shift changes 58% of
  cells under Smooth and none under Sharp.

The panel is **non-modal and docked over the left of the chart**, not a centred dialog behind
a scrim. The entire point of these controls is watching the chart change as you drag them, so
the chart stays visible and pannable, and clicking outside does not dismiss the panel. It is
anchored to the canvas rather than the viewport so it never covers the canvas-size or
Smooth/Sharp buttons — four of the settings apply only to Sharp, so you need to switch method
while the panel is open. On a phone it becomes a bottom sheet at 62vh, leaving the top of the
chart visible.

Defaults reproduce the standard conversion exactly, which a test asserts, so Reset always
returns to a known baseline. Stored per browser rather than per project: these are tuning
preferences, not content.

## 10. Theme

Light and dark, toggled in the top bar and remembered, defaulting to the system setting.
Dark mode darkens the page, the panels, and the surround behind the chart.

Two things stay deliberately fixed across themes. Gridlines stay dark, because they mostly
cross beads whose colours are arbitrary and a light line would vanish on the many pale
beads. Empty holes stay a mid-grey checkerboard rather than going near-black, so those dark
gridlines still read where they cross a hole.

## 11. Measured cost

Worst case, 104×104 with every cell a distinct colour: stage A ~6ms, stage B ~20ms.
Merge plan ~8ms, computed once per chart. A slider move re-runs only stage C: ~1ms of work,
16-18ms including React re-render and canvas redraw — one frame, so dragging is smooth.
