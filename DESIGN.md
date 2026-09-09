# 拼好豆 — image to Mard bead chart

Converts an image into a pixel-bead (拼豆 / perler) template using the Mard standard palette,
and displays it as a zoomable grid where every cell shows its bead code.

Status: design agreed, not yet built. See ROADMAP.md for deferred features.

---

## 1. Architecture

**Everything runs in the browser. There is no server.**

The whole pipeline — decode image, downsample to a grid, match each cell against the stocked colors,
draw the result — is milliseconds of work on a canvas. A backend would add hosting cost, upload
latency, and responsibility for other people's photos, and buy nothing.

Consequences, accepted deliberately:

- The site is static files. Free hosting, no database, no accounts, no server maintenance.
- No image ever leaves the user's device. This is a real privacy feature worth stating in the UI.
- The palette ships inside the app. Updating it means editing a file and redeploying.
  Fine, because the Mard chart is fixed and will not change.
- Saved projects live in the user's own browser (see ROADMAP R5). Same-device by design.

## 2. Stack

- Vite + React + TypeScript
- Grid rendered to `<canvas>`, not DOM. At 104x104 that is 10,816 cells; DOM would crawl.
- i18n (English / Chinese) with a switch, wired in from the first commit.
  Retrofitting translation into a finished UI is far more painful than building with it.
  The product name 拼好豆 and its subtitle 拼豆图纸生成 are deliberately *not* translated,
  and read the same in both languages.
- The icon is pixel art, so it is rebuilt from its native 25x25 grid, scaled by whole
  pixels only, and rendered with `image-rendering: pixelated`. Its white background is
  removed by flood fill from the corners rather than by keying out white, so any white
  inside the artwork survives.
- Deployed to a free static host (Cloudflare Pages or Netlify) from a GitHub repo.
  Public URL, intended for strangers to use, not just the author.

## 3. Palette data

Source: https://www.pixel-beads.com/zh/mard-bead-color-chart — 291 colors, hex values inline.

Scraped **once** into `src/data/mard-palette.json`, committed to the repo. Never fetched at runtime.

Series: A1–A26, B1–B32, C1–C29, D1–D26, E1–E24, F1–F25, G1–G21, H1–H23, M1–M15,
plus extended series P, Q, R, T, Y, ZG.

Each entry: `{ code, hex, lab, series }`.

**221 of the 291 codes are used for matching.** The extended series — P, Q, R, T, Y and ZG — are
specialty beads (glitter, glow-in-the-dark, transparent) that a colour chart cannot honestly
represent and that this build does not stock; matching against them would produce charts that
cannot be made. Excluding all six leaves exactly the 221 standard colours the source chart advertises: A-H
plus M. `EXCLUDED_SERIES_PREFIXES` in `palette.ts` is the one place this is decided, and
`ALL_BEADS` still holds all 291 so restoring a series is an edit to one array.

A useful side effect: every duplicate colour on the chart lived in the excluded series — the
nine identical `#FFFFFF` entries (H2 plus the ZG glow series) and the Q4/R11 pair — so the
stocked palette has no duplicate colours and matching has no ties to break. The tie-break is
kept anyway, so ordering stays deterministic if the series are ever restored.

## 4. Output sizing

Preset square canvases — **52x52, 78x78, 104x104** — plus **Custom**, any square size
from **16 to 200** beads.

The floor is where there is too little grid left to recognise anything. The ceiling is set by
the PNG export, not by conversion: conversion stays under 200ms well past 200, but the export
clamps its cell to 26px so codes stay legible, which means beyond ~180 cells the image simply
grows, and by 320 it exceeds what browsers will allocate. 200x200 is also 40,000 beads, about
a metre square in real life, so the limit is generous for the craft as well as for the code.

Typing applies live, but only once the number is in range — otherwise "1" on the way to "120"
would convert at a one-bead canvas. Out-of-range values are clamped on blur.

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

Stage A is cached. Stage B is one distance comparison per stocked bead per cell — about 3M for the largest canvas,
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
- **Nothing in the draw path may be sized by the zoom level.** Every operation is
  clamped to the cells actually on screen, so the cost of a frame depends on the
  viewport and nothing else. Two rounds of this were needed:
  - The hole checkerboard was 8px squares looped across the chart's whole
    on-screen extent: 1,368,900 `fillRect` calls per redraw at maximum zoom
    against 7,056 when fitted. Now one patterned fill over the visible rectangle.
  - `drawImage` was handed the chart's full extent as its destination — a
    9360×9360 surface at maximum zoom, which a browser may allocate before
    clipping. Now the nine-argument form draws only the visible sub-rectangle.
    Painted area per frame fell from 87.6 megapixels to 0.91, and is now bounded
    by the viewport.
- Redraws are coalesced into an animation frame. A pinch emits touchmove far more
  often than the display refreshes, so drawing per event painted each frame
  several times over.
- The chart repaints on `visibilitychange`. A phone can discard the canvas
  backing store while the tab is backgrounded and it returns blank; without this
  nothing would schedule a repaint, and the chart would stay empty.
- The canvas backing store is only reallocated when its size changes. Assigning
  `canvas.width` or `canvas.height` reallocates several megabytes and resets the
  context; doing it once per pinch frame was the second half of the same failure.
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

## 8. Focus mode

A mode for the half hour you spend actually placing beads, rather than the two minutes
spent converting. Entered from an accent button in the top bar; everything goes except the
chart, which then fills the viewport.

What survives is only what you use with beads in your hands:

- **Exit**
- **Day/night**, because the lamp over a craft table changes and a chart that was readable
  at 3pm is glare at 9pm
- **Layers** — the bead list, to isolate one colour and place all of it in one pass. The
  button doubles as the status readout, showing the active swatch, code and count, so the
  bar tells you what you are working on without opening anything.

The bar sits bottom-centre rather than in a corner: the phone is propped next to the
pegboard and that is where a thumb lands. Escape closes the layer list first, then leaves
focus, so the key never does something drastic when you meant something small.

A **wake lock** is held while focus mode is on. Both hands are busy with tweezers, so
nothing touches the screen for minutes and the display would otherwise dim exactly when it
is being read. It is re-acquired on `visibilitychange`, since the browser drops it whenever
the tab is backgrounded, and it fails silently where unsupported.

## 9. Saved projects

localStorage, plus export/import of a `.pindou.json` file. Same-device by design.
Projects written by older versions still open — removed fields are simply ignored.
Stored source images are re-encoded at most 640px on the longest side — the grid is at most
104 cells, so more resolution buys nothing and it keeps roughly 90 projects inside the
storage budget. PNG where transparency must survive, JPEG otherwise.

Clearing site data loses saves. That is exactly why the export button is not optional.

## 10. Advanced settings

Seven conversion parameters behind an **Advanced** button, listed in the order the pipeline
applies them:

1. **Kernel shape** — box / tent / gaussian / mitchell / lanczos, weighting source pixels
   within a cell. Box is the original uniform weighting.
2. **Boundary handling** — snap (whole pixels per cell) or exact (edge pixels weighted by
   the fraction the cell actually covers).
3. **Alpha threshold** — coverage a cell needs to get a bead. Inert on an image with no
   transparency, which the panel now says outright rather than leaving you to wonder.
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
- **Boundary handling cannot produce a visible difference at this reduction ratio, and that
  is structural.** Measured on a photo, snap vs exact moves a cell's colour by a mean of
  **0.26 dE**, against a median nearest-neighbour distance of **3.87 dE** in the palette —
  about 7% of one quantisation step, so ~15x too small to change which bead is chosen. The
  3.5% of beads that do change are cells sitting almost exactly on the boundary between two
  beads, where an imperceptible nudge tips them over. It also does nothing at all under a
  smooth kernel (0.0% with gaussian), which already tapers to near-zero at the support edge.
  Kept because it was asked for, but it fails the test that selected the other parameters.
- **Bin merging can raise the colour count, not lower it.** On flat art it took 3 colours to
  7, because the winner's representative colour becomes the mean over the pooled group,
  which blends in the anti-aliased neighbours it merged. It helps photos (8.9% of cells
  change) and hurts flat art. It is a bin-splitting fix, not a cleanup knob.
- **Bin refinement is the strongest of the new controls.** Bin centre versus mean changes
  20.8% of cells at 4 bits and 48.8% at 3 bits, and at 3 bits it drops a photo from 125 to
  95 colours. Choosing the bin centre quantises output onto the bin grid, which is what
  makes the bin-width setting plainly visible.
- **The alpha threshold's reach depends entirely on the source edge.** With no alpha channel
  it is mathematically incapable of doing anything. On a hard 1px cutout it moves ~3% of
  beads, one bead of silhouette. On a feathered edge it moves ~8%. It only ever acts on the
  boundary ring, so it can never be a large effect.
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

## 11. Theme

Light and dark, toggled in the top bar and remembered, defaulting to the system setting.
Dark mode darkens the page, the panels, and the surround behind the chart.

Two things stay deliberately fixed across themes. Gridlines stay dark, because they mostly
cross beads whose colours are arbitrary and a light line would vanish on the many pale
beads. Empty holes stay a mid-grey checkerboard rather than going near-black, so those dark
gridlines still read where they cross a hole.

## 12. Measured cost

Worst case, 104×104 with every cell a distinct colour: stage A ~6ms, stage B ~20ms.
Merge plan ~8ms, computed once per chart. A slider move re-runs only stage C: ~1ms of work,
16-18ms including React re-render and canvas redraw — one frame, so dragging is smooth.
