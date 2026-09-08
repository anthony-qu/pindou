# Roadmap — agreed, deferred until after v1

Decided during the design conversation. None require changing the core architecture.
Order is roughly the order they should be built.

---

## Still to build

### R2 — "Tidy" slider (remove isolated beads)  *(implemented, not exposed)*

A lone red bead stranded in a field of blue is a genuine annoyance when beading. A mode filter
fixes exactly this. Kept as its **own control**, deliberately not folded into R1 — it is a different
axis (spatial noise, not color count), and two sliders that each do one comprehensible thing beat
one that does both muddily.

`removeIslands` in `src/lib/simplify.ts` is written and covered by tests; only the UI control
was pulled, and `MIN_ISLAND` in `App.tsx` holds it at off. Re-exposing it is a slider, not an
algorithm.

### R3 — Background removal

Two different jobs, both wanted:

- **Flood-fill from the corners with a color tolerance.** Instant, no download, near-perfect on flat
  backgrounds — anime, logos, sprites. Runs by default.
- **ML segmentation**, opt-in button. RMBG-1.4 or BiRefNet via transformers.js / ONNX Runtime Web,
  WebGPU where available, WASM otherwise. For photos with real backgrounds. **Lazy-loaded on click
  only** — a 40–80MB one-time model download must never be paid by someone beading sprites.
  OPEN: check the model licence; some are non-commercial-use only.

**Ordering constraint:** background removal runs on the **full-resolution image, before downsampling**.
The alpha mask is then downsampled with everything else, and a cell becomes "no bead" if most of its
source pixels were transparent. Doing it after downsampling throws away the model's precision.

### R4 — Manual erase

Click a region, or a color in the legend, to mark it "no bead". Needed regardless of how good R3 is —
both methods will occasionally be wrong, and at 52x52 a wrong mask ruins the chart. Doubles as a
general cleanup tool.

### R7 — Inventory

Restrict matching to bead codes the user owns. Entry via a visual grid of all 291 swatches grouped
by series, click to toggle, saved once and reused. Because of the stage A/B split, applying an
inventory filter is instant.

Possible extension: track *quantities*, so the count list can say "you are 40 short on B7".

### R8 — Crop / fit control

v1 letterboxes: a 16:9 photo into a 104 square uses only 104x58 and wastes half the canvas.
Offer crop-to-fill as an alternative, with a draggable crop box.

### R10 — Image pre-adjustment

Brightness / contrast / saturation sliders before conversion. Photos in particular often need a
saturation boost to survive reduction to a bead palette without going muddy.

### R11 — Pixel-art source detection

Detect when the input is already pixel art at a native sprite size and sample rather than average,
so a 32x32 sprite maps cleanly onto the grid instead of blurring.

---

## Shipped

Kept here because the reasoning still explains why they work the way they do.

### R9 — Printable chart (shipped as PNG export)

Export PNG renders the chart at high resolution: every cell filled and labelled with its bead
code, counting gridlines dashed at 5 and solid at 10, edge rulers every 10 so you can find
your place, a header with the project name and totals, and a legend of every code with its
count. Always drawn on white regardless of the app theme, since it is a document and a dark
chart is unusable on paper.

Cell size targets a 4600px long edge, clamped to 26-72px, so a 52 grid exports at 72px per
cell and a 104 grid at 44px. A 104x104 chart comes out around 4700x4100 and 3MB.

The legend's column width is measured from the widest code and count actually present. A
fixed guess clipped five-digit counts under the next entry's swatch.

Replaced the `.pindou.json` project export at the user's request. `exportProjectFile` and
`importProjectFile` remain in `projects.ts`, and the landing page can still open a previously
exported file, but nothing produces one any more.

### R1 — "Simplify colors" slider

The problem: independent per-cell matching against 291 colors will use 120+ distinct bead codes
on a photo, and because the Mard palette contains many perceptually near-identical entries,
dozens of those are pairs you cannot tell apart in hand. Miserable to bead, absurd to buy for.

The mechanism: **agglomerative merging of the codes actually used**. Repeatedly merge the pair
that costs least to merge, where cost weighs both perceptual distance (CIEDE2000) and how few
beads use each code. Compute the full merge sequence once.

Why this shape: the slider is then just an index into that precomputed list, so every position is
exactly one merge event — genuinely discrete stops, instant preview, no recomputation. The label
shows the true count at each stop (`47 → 38 → 31 → 24…`). Near-identical pairs collapse first,
then rarely-used colors get absorbed into their nearest neighbour. Degrades in the order a human
would choose by hand.

Default position: **no simplification** — show the raw count the conversion produced, let the user
pull it down.

Shipped with a Ward-style merge cost — perceptual distance scaled by the harmonic size of the two
groups — so near-identical codes and barely-used codes merge first while a large block of a
distinctive colour survives to the end.

Rejected alternatives:

- *Spatial smoothing / max-pooling as the mechanism.* Blurring averages neighbours into new
  in-between colors that then re-match to the palette, which often *increases* the distinct count.
  Mode-pooling reduces it only as a side effect of destroying detail, with no real control.
- *k-means quantisation.* Exact count control, but each k is a fresh run, so colours swap identity
  between adjacent stops and the preview jumps instead of settling. Also ignores space entirely.
- *Region segmentation.* The most literal reading of the brief and genuinely local, but the most
  code to build and tune, and it tends to posterise soft shading.
- *One spatially-aware slider* combining both effects. Elegant, but you cannot then say
  "merge less, clean more", and the behaviour is much harder to predict.

### R5 — Save & reopen projects

`localStorage` for the project list, plus a **download / upload project file** button as the backup
the user actually controls. No backend, no accounts. Clearing browser data loses saves, which is
exactly why the download button is not optional.

### R6 — Work mode (shipped as colour isolation)

Dim everything except one bead colour at a time, so you place all the A1s, then all the B7s.

Progress ticking shipped alongside it and was then removed at the user's request: you do not
interact with the screen while your hands are placing beads, so the taps, the tick marks and
the stored progress were all cost with no benefit.
