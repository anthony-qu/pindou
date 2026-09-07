# Pindou · 拼豆

Turns an image into a pixel-bead (拼豆 / perler) chart using the **Mard 291-colour palette**,
and shows it as a zoomable grid where every cell carries its bead code.

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
5. **Read the chart** — pan and zoom (pinch on a phone), codes appear as you zoom in,
   with dashed gridlines every 5 cells and solid ones every 10 so you can count your place.
6. **Shop from the bead list** — every code used, with its exact count.

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
image ──▶ [A] downsample to a grid of true colours ──▶ [B] match each cell to a Mard code ──▶ render
               expensive, runs once                       cheap, re-runs freely
```

Stage A is cached, so stage B can be re-run whenever palette constraints change without
re-reading the image. Measured worst case for a full 104×104 conversion where every one of
the 10,816 cells is a different colour: **~28 ms**. That is what makes the planned features
(inventory filtering, colour simplification) feel instant.

| File | Role |
| --- | --- |
| `src/data/mardPalette.json` | The 291 Mard codes and hex values, scraped once |
| `src/lib/color.ts` | sRGB→CIELAB and CIEDE2000, verified against Sharma et al. reference data |
| `src/lib/palette.ts` | Nearest-bead matcher: cheap shortlist, then accurate re-rank |
| `src/lib/pixelate.ts` | Stage A — downsampling, aspect fitting, transparency |
| `src/lib/chart.ts` | Stage B — palette matching and bead counts |
| `src/components/ChartCanvas.tsx` | The zoomable chart, gridlines and codes |

See **DESIGN.md** for the decisions and why they were made, and **ROADMAP.md** for what is
deliberately not built yet.

## Notes on the palette

Nine codes carry an identical `#FFFFFF`: H2 plus the whole ZG series, which is
glow-in-the-dark and cannot be represented on a colour chart. Q4 and R11 are both `#FFEBFA`.
Matching therefore has genuine ties, and they break towards the lower chart position — so
white resolves to H2 rather than arbitrarily sending you to buy glow beads.
