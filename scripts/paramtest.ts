import { pixelate, fitGrid, DEFAULT_PIXELATE, type PixelateOptions, type SampleMethod } from '../src/lib/pixelate'
import type { Kernel } from '../src/lib/kernel'
import { buildChart, EMPTY } from '../src/lib/chart'
import { PALETTE } from '../src/lib/palette'
import { rgbToLab } from '../src/lib/color'

let fails = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) fails++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

/* ---------- fixtures ---------- */

function make(w: number, h: number, f: (x: number, y: number) => [number, number, number, number]) {
  const img = { data: new Uint8ClampedArray(w * h * 4), width: w, height: h } as ImageData
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b, a] = f(x, y)
    const i = (y * w + x) * 4
    img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = a
  }
  return img
}

// Fine black/white checkerboard: every cell is exactly half black, half white.
const checker = make(832, 832, (x, y) => (x + y) % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255])

// Photo-ish gradients.
const photo = make(624, 416, (x, y) => [
  120 + Math.round(90 * Math.sin(x / 40) * Math.cos(y / 55)),
  110 + Math.round(80 * Math.sin((x + y) / 60)),
  140 + Math.round(80 * Math.cos(x / 30 + y / 70)),
  255,
])

// Flat-colour art with anti-aliased edges and a soft alpha rim, built by
// 4x4 supersampling. Hard-edged fixtures make the alpha threshold and the bin
// width look inert, because no cell ever ends up partly covered.
const art = make(520, 520, (x, y) => {
  let r = 0, g = 0, b = 0, a = 0
  for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
    const px = x + (sx + 0.5) / 4, py = y + (sy + 0.5) / 4
    const d = Math.hypot(px - 260, py - 260)
    if (d > 230) continue
    a += 255
    if (d > 165) { r += 40; g += 90; b += 180 }
    else if (Math.floor(px / 40) % 2 === Math.floor(py / 40) % 2) { r += 230; g += 80; b += 60 }
    else { r += 250; g += 220; b += 60 }
  }
  return a === 0 ? [0, 0, 0, 0] : [r / (a / 255), g / (a / 255), b / (a / 255), a / 16]
})

// Hard-edged pixel art, for the grid-phase test specifically.
const pixels = make(234, 234, (x, y) => {
  const sx = Math.floor(x / 9), sy = Math.floor(y / 9)
  return ((sx * 7 + sy * 3) % 5 === 0) ? [230, 80, 60, 255] : [40, 90, 180, 255]
})

const opts = (o: Partial<PixelateOptions>): PixelateOptions => ({ ...DEFAULT_PIXELATE, ...o })

/** Mean of the grid's own colours, before palette matching. */
function gridMeanRgb(img: ImageData, canvas: number, o: Partial<PixelateOptions>) {
  const { width, height } = fitGrid(img.width, img.height, canvas)
  const g = pixelate(img, width, height, 'average', opts(o))
  let r = 0, gg = 0, b = 0, n = 0
  for (let i = 0; i < width * height; i++) {
    if (!g.opaque[i]) continue
    r += g.colors[i * 3]; gg += g.colors[i * 3 + 1]; b += g.colors[i * 3 + 2]; n++
  }
  return { r: r / n, g: gg / n, b: b / n }
}

function run(img: ImageData, canvas: number, method: SampleMethod, o: Partial<PixelateOptions>) {
  const { width, height } = fitGrid(img.width, img.height, canvas)
  const t = Date.now()
  const grid = pixelate(img, width, height, method, opts(o))
  const ms = Date.now() - t
  const chart = buildChart(grid)
  let sumL = 0, n = 0
  for (let i = 0; i < chart.cells.length; i++) {
    if (chart.cells[i] === EMPTY) continue
    sumL += PALETTE[chart.cells[i]].lab.L; n++
  }
  return { chart, ms, meanL: n ? sumL / n : 0, beads: chart.totalBeads, colours: chart.counts.length }
}

const diff = (a: Int16Array, b: Int16Array) => {
  let d = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++
  return (100 * d) / a.length
}

/* ---------- 1. averaging colour space ---------- */
console.log('\n=== 1. Averaging colour space (half-black/half-white cells) ===')
const base = run(checker, 104, 'average', {})
const lin = run(checker, 104, 'average', { space: 'linear' })
const lab = run(checker, 104, 'average', { space: 'lab' })
const trueMidL = rgbToLab(188, 188, 188).L
console.log(`  sRGB    mean L* ${base.meanL.toFixed(1)}   ${base.ms}ms`)
console.log(`  linear  mean L* ${lin.meanL.toFixed(1)}   ${lin.ms}ms`)
console.log(`  lab     mean L* ${lab.meanL.toFixed(1)}   ${lab.ms}ms`)
console.log(`  correct answer for 50/50 black+white: L* ${trueMidL.toFixed(1)}`)
check('sRGB averaging is measurably too dark', base.meanL < lin.meanL - 15,
  `${(lin.meanL - base.meanL).toFixed(1)} L* darker`)
const gm = gridMeanRgb(checker, 104, { space: 'linear' })
console.log(`  grid colour before matching: linear -> rgb ${gm.r.toFixed(0)} (correct is 188)`)
check('linear averaging produces the physically correct grey', Math.abs(gm.r - 188) < 2,
  `got ${gm.r.toFixed(1)}, want 188`)
const gs = gridMeanRgb(checker, 104, { space: 'srgb' })
const gl = gridMeanRgb(checker, 104, { space: 'lab' })
console.log(`  grid colour before matching: sRGB -> ${gs.r.toFixed(0)}, lab -> ${gl.r.toFixed(0)}`)
check('Lab averaging behaves like sRGB, not like linear', Math.abs(gl.r - 188) > 40,
  `lab gives ${gl.r.toFixed(0)}, a perceptual midpoint, not a photometric one`)

/* ---------- 2. sharp bin width ---------- */
console.log('\n=== 2. Sharp bin width ===')
for (const bits of [3, 4, 5, 6]) {
  const f = run(art, 104, 'sharp', { quantBits: bits })
  const ph = run(photo, 104, 'sharp', { quantBits: bits })
  console.log(`  ${bits} bits (${String(2 ** (8 - bits)).padStart(2)} levels): flat art ${String(f.colours).padStart(3)} colours | photo ${String(ph.colours).padStart(3)} colours`)
}
const b3 = run(photo, 104, 'sharp', { quantBits: 3 })
const b6 = run(photo, 104, 'sharp', { quantBits: 6 })
check('bin width changes the result', diff(b3.chart.cells, b6.chart.cells) > 5,
  `${diff(b3.chart.cells, b6.chart.cells).toFixed(1)}% of cells differ`)

/* ---------- 3. dominance threshold ---------- */
console.log('\n=== 3. Dominance threshold (sharp, photo) ===')
const domRef = run(photo, 104, 'sharp', { dominance: 0 })
for (const d of [0, 0.3, 0.5, 0.7, 0.9]) {
  const r = run(photo, 104, 'sharp', { dominance: d })
  console.log(`  ${String(Math.round(d * 100)).padStart(2)}%: ${String(r.colours).padStart(3)} colours, ${diff(domRef.chart.cells, r.chart.cells).toFixed(1)}% cells differ from off`)
}
const dom9 = run(photo, 104, 'sharp', { dominance: 0.9 })
const meanRef = run(photo, 104, 'average', {})
check('full dominance collapses sharp onto the mean', diff(dom9.chart.cells, meanRef.chart.cells) < 2,
  `${diff(dom9.chart.cells, meanRef.chart.cells).toFixed(1)}% differ from Smooth`)
check('dominance does nothing on flat art', (() => {
  const a = run(art, 52, 'sharp', { dominance: 0 })
  const b = run(art, 52, 'sharp', { dominance: 0.6 })
  return diff(a.chart.cells, b.chart.cells) < 2
})(), 'flat cells always have a dominant colour')

/* ---------- 5. grid phase ---------- */
console.log('\n=== 5. Grid phase (26x26 sprite at 9x) ===')
const a0 = run(pixels, 26, 'average', { phaseX: 0, phaseY: 0 })
const a5 = run(pixels, 26, 'average', { phaseX: 0.5, phaseY: 0.5 })
const s0 = run(pixels, 26, 'sharp', { phaseX: 0, phaseY: 0 })
const s5 = run(pixels, 26, 'sharp', { phaseX: 0.5, phaseY: 0.5 })
console.log(`  Smooth: phase 0.0 -> ${a0.colours} colours | phase 0.5 -> ${a5.colours} colours, ${diff(a0.chart.cells, a5.chart.cells).toFixed(1)}% of cells differ`)
console.log(`  Sharp : phase 0.0 -> ${s0.colours} colours | phase 0.5 -> ${s5.colours} colours, ${diff(s0.chart.cells, s5.chart.cells).toFixed(1)}% of cells differ`)
check('phase wrecks Smooth on pixel art', diff(a0.chart.cells, a5.chart.cells) > 20,
  `${diff(a0.chart.cells, a5.chart.cells).toFixed(1)}% of cells differ, ${a0.colours} -> ${a5.colours} colours`)
// The mode still picks the majority block under a half-cell shift, so Sharp
// shrugs off exactly the misalignment that ruins the mean.
check('Sharp is phase-robust', diff(s0.chart.cells, s5.chart.cells) < 5,
  `${diff(s0.chart.cells, s5.chart.cells).toFixed(1)}% of cells differ`)

/* ---------- 6. alpha threshold ---------- */
console.log('\n=== 6. Bead coverage threshold (sprite with transparency) ===')
let prev = Infinity
let monotone = true
for (const a of [0.2, 0.35, 0.5, 0.65, 0.8]) {
  const r = run(art, 52, 'average', { alphaThreshold: a })
  console.log(`  ${a.toFixed(2)}: ${r.beads} beads`)
  if (r.beads > prev) monotone = false
  prev = r.beads
}
check('raising the threshold never adds beads', monotone)
const lo = run(art, 52, 'average', { alphaThreshold: 0.2 })
const hi = run(art, 52, 'average', { alphaThreshold: 0.8 })
check('threshold visibly changes the silhouette', lo.beads > hi.beads,
  `${lo.beads} vs ${hi.beads} beads`)

/* ---------- 7. saturation ---------- */
console.log('\n=== 7. Saturation boost (photo) ===')
function meanChroma(cells: Int16Array) {
  let s = 0, n = 0
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === EMPTY) continue
    const { a, b } = PALETTE[cells[i]].lab
    s += Math.hypot(a, b); n++
  }
  return n ? s / n : 0
}
for (const sat of [0.6, 1.0, 1.4, 1.8]) {
  const r = run(photo, 104, 'average', { saturation: sat })
  console.log(`  ${sat.toFixed(1)}x: mean chroma ${meanChroma(r.chart.cells).toFixed(1)}, ${r.colours} colours`)
}
const s06 = run(photo, 104, 'average', { saturation: 0.6 })
const s18 = run(photo, 104, 'average', { saturation: 1.8 })
check('saturation raises chroma monotonically',
  meanChroma(s18.chart.cells) > meanChroma(s06.chart.cells) + 5,
  `${meanChroma(s06.chart.cells).toFixed(1)} -> ${meanChroma(s18.chart.cells).toFixed(1)}`)

/* ---------- defaults are a no-op ---------- */
console.log('\n=== defaults reproduce the original conversion ===')
const explicit = run(photo, 104, 'average', {
  space: 'srgb', quantBits: 4, dominance: 0, alphaThreshold: 0.5, saturation: 1, phaseX: 0, phaseY: 0,
})
check('explicit defaults == DEFAULT_PIXELATE', diff(explicit.chart.cells, meanRef.chart.cells) === 0)

console.log('\n=== cost of the colour-space choice (1600x1200 source, worst case) ===')
const big = make(1600, 1200, (x, y) => [(x * 3) % 256, (y * 5) % 256, (x + y) % 256, 255])
for (const space of ['srgb', 'linear', 'lab'] as const) {
  run(big, 104, 'average', { space })            // warm the JIT
  const best = Math.min(...[0, 1, 2].map(() => run(big, 104, 'average', { space }).ms))
  console.log(`  ${space.padEnd(7)} ${best}ms`)
}

/* ---------- newly exposed: kernel shape ---------- */
console.log('\n=== kernel shape (photo, Smooth) ===')
const kBox = run(photo, 104, 'average', { kernel: 'box' })
for (const k of ['box', 'tent', 'gaussian', 'mitchell', 'lanczos'] as Kernel[]) {
  const r = run(photo, 104, 'average', { kernel: k })
  console.log(`  ${k.padEnd(9)} ${String(r.colours).padStart(3)} colours, ${diff(kBox.chart.cells, r.chart.cells).toFixed(1).padStart(5)}% differ from box, ${r.ms}ms`)
}
const kLan = run(photo, 104, 'average', { kernel: 'lanczos' })
check('kernel shape changes the result', diff(kBox.chart.cells, kLan.chart.cells) > 2,
  `box vs lanczos: ${diff(kBox.chart.cells, kLan.chart.cells).toFixed(1)}% of cells differ`)

console.log('\n=== kernel shape on flat art (Sharp) ===')
for (const k of ['box', 'tent', 'lanczos'] as Kernel[]) {
  const r = run(art, 104, 'sharp', { kernel: k })
  console.log(`  ${k.padEnd(9)} ${r.colours} colours`)
}

/* ---------- newly exposed: boundary handling ---------- */
console.log('\n=== boundary handling ===')
for (const k of ['box', 'gaussian'] as Kernel[]) {
  const snap = run(photo, 104, 'average', { kernel: k, boundary: 'snap' })
  const exact = run(photo, 104, 'average', { kernel: k, boundary: 'exact' })
  console.log(`  ${k.padEnd(9)} snap ${snap.colours} colours vs exact ${exact.colours}, ${diff(snap.chart.cells, exact.chart.cells).toFixed(1)}% of cells differ`)
}
const bSnap = run(photo, 104, 'average', { boundary: 'snap' })
const bExact = run(photo, 104, 'average', { boundary: 'exact' })
check('boundary handling changes the result', diff(bSnap.chart.cells, bExact.chart.cells) > 0.5,
  `${diff(bSnap.chart.cells, bExact.chart.cells).toFixed(1)}% of cells differ`)

/* ---------- newly exposed: bin merging ---------- */
console.log('\n=== bin merging before argmax (Sharp) ===')
const mRef = run(photo, 104, 'sharp', { binMerge: 0 })
for (const m of [0, 1, 2, 3]) {
  const r = run(photo, 104, 'sharp', { binMerge: m })
  const f = run(art, 104, 'sharp', { binMerge: m })
  console.log(`  +-${m} bins: photo ${String(r.colours).padStart(3)} colours (${diff(mRef.chart.cells, r.chart.cells).toFixed(1)}% differ), flat art ${f.colours} colours, ${r.ms}ms`)
}
const m3 = run(photo, 104, 'sharp', { binMerge: 3 })
check('bin merging changes the result', diff(mRef.chart.cells, m3.chart.cells) > 1,
  `${diff(mRef.chart.cells, m3.chart.cells).toFixed(1)}% of cells differ`)

/* ---------- newly exposed: refinement within the winning bin ---------- */
console.log('\n=== bin refinement (Sharp) ===')
for (const bits of [3, 4, 6]) {
  const mean = run(photo, 104, 'sharp', { quantBits: bits, refine: 'mean' })
  const centre = run(photo, 104, 'sharp', { quantBits: bits, refine: 'centre' })
  console.log(`  ${bits} bits: mean ${String(mean.colours).padStart(3)} colours vs centre ${String(centre.colours).padStart(3)}, ${diff(mean.chart.cells, centre.chart.cells).toFixed(1)}% differ`)
}
const rMean = run(photo, 104, 'sharp', { refine: 'mean' })
const rCentre = run(photo, 104, 'sharp', { refine: 'centre' })
check('refinement changes the result', diff(rMean.chart.cells, rCentre.chart.cells) > 5,
  `${diff(rMean.chart.cells, rCentre.chart.cells).toFixed(1)}% of cells differ`)

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`)
process.exit(fails ? 1 : 0)
