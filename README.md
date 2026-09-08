# 拼好豆 · 拼豆图纸生成

Turns an image into a pixel-bead (拼豆 / perler) chart using the **Mard standard palette** (222 stocked colours),
and shows it as a zoomable grid where every cell carries its bead code.

The interface is bilingual, but the name is not translated: it is 拼好豆 in both languages.

Everything runs in the browser. No server, no accounts, no uploads — your image never
leaves your device.

## What it does

1. **Upload** any image (PNG, JPG, WebP, GIF).
2. **Pick a canvas** — 52×52, 78×78 or 104×104 beads. The image keeps its aspect ratio and
   fills the canvas as far as it can.
3. **Pixelate**, with two sampling methods:
   - **Smooth** averages each cell — right for photos.
   - **Sharp** takes the dominant colour in each cell — right for anime, logos and sprites,
     where averaging would smear outlines into halos.
4. **Match** every cell to its nearest Mard bead using CIEDE2000 in CIELAB.
5. **Simplify colors** — one slider that merges bead codes which look alike, closest and
   least-used first. A photo lands at 150+ codes; pull this down and watch the count fall one
   merge at a time until it is something you can actually buy and bead. It does not blur:
   flat areas and hard edges are untouched.
6. **Read the chart** — pan and zoom (pinch on a phone), codes appear as you zoom in,
   with dashed gridlines every 5 cells and solid ones every 10 so you can count your place.
7. **Isolate a colour** — pick one in the bead list to fade everything else back, so you can
   place every A18 in one pass.
8. **Shop from the bead list** — every code used, with its exact count.
9. **Save** — projects are kept in this browser, and can be exported to a file you control.

Light and dark themes, English and Chinese, and built mobile-first.

Transparent areas of the image become empty holes rather than white beads.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static files in dist/
npm test         # colour maths, palette and pipeline self-tests
npm run bench    # worst-case conversion timing
```

`dist/` is plain static files — deploy to Cloudflare Pages, Netlify, GitHub Pages or any
static host, no configuration needed.

## How it is put together

The pipeline splits into two deliberately separate stages:

```
image ──▶ [A] downsample to true colours ──▶ [B] match to Mard codes ──▶ [C] simplify ──▶ render
               expensive, runs once              cheap                     cheap, per slider move
```

Stage A is cached, so the later stages re-run whenever palette constraints change without
re-reading the image. Measured worst case for a full 104×104 conversion where every one of
the 10,816 cells is a different colour: **~28 ms**. The merge plan costs ~8 ms once per chart,
after which a slider move is ~1 ms of work and 16–18 ms including React re-render and canvas
redraw — one frame, so dragging stays smooth.

| File | Role |
| --- | --- |
| `src/data/mardPalette.json` | The 291 Mard codes and hex values, scraped once |
| `src/lib/color.ts` | sRGB→CIELAB and CIEDE2000, verified against Sharma et al. reference data |
| `src/lib/palette.ts` | Nearest-bead matcher: cheap shortlist, then accurate re-rank |
| `src/lib/pixelate.ts` | Stage A — downsampling, aspect fitting, transparency |
| `src/lib/chart.ts` | Stage B — palette matching and bead counts |
| `src/lib/simplify.ts` | Stage C — colour merging and stray-bead cleanup |
| `src/lib/projects.ts` | Saving, loading, and `.pindou.json` export/import |
| `src/components/ChartCanvas.tsx` | The zoomable chart, gridlines and codes |

See **DESIGN.md** for the decisions and why they were made, and **ROADMAP.md** for what is
deliberately not built yet.

## Notes on the palette

The full Mard chart holds 291 codes, but the extended series — P, Q, R, Y and ZG — are
specialty beads (glitter, glow-in-the-dark, transparent) that a colour chart cannot honestly
represent and that this build does not stock. They are excluded from matching, leaving **222**.

That exclusion also removed every duplicate colour on the chart: the nine identical `#FFFFFF`
entries (H2 plus the whole ZG glow series) and the Q4/R11 pair were all in the excluded
series, so matching no longer has any ties to break.

`EXCLUDED_SERIES_PREFIXES` in `src/lib/palette.ts` is the single place this is decided.
