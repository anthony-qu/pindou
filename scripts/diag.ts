/** Why boundary handling and the alpha threshold look inert: measure the size
 *  of the change they cause against the palette's own quantisation step. */
import { pixelate, fitGrid, DEFAULT_PIXELATE, type PixelateOptions } from '../src/lib/pixelate'
import { buildChart, EMPTY } from '../src/lib/chart'
import { PALETTE } from '../src/lib/palette'
import { ciede2000, rgbToLab } from '../src/lib/color'

const opts = (o: Partial<PixelateOptions>): PixelateOptions => ({ ...DEFAULT_PIXELATE, ...o })

function make(w: number, h: number, f: (x: number, y: number) => [number, number, number, number]) {
  const img = { data: new Uint8ClampedArray(w * h * 4), width: w, height: h } as ImageData
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b, a] = f(x, y); const i = (y * w + x) * 4
    img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = a
  }
  return img
}

// How far apart are neighbouring beads? Anything smaller than this cannot
// change which bead a cell picks.
const nn: number[] = []
for (const a of PALETTE) {
  let best = Infinity
  for (const b of PALETTE) if (a !== b) { const d = ciede2000(a.lab, b.lab); if (d < best) best = d }
  nn.push(best)
}
nn.sort((x, y) => x - y)
const medianStep = nn[Math.floor(nn.length / 2)]
console.log(`palette nearest-neighbour distance: median ${medianStep.toFixed(2)} dE, 25th pct ${nn[Math.floor(nn.length * .25)].toFixed(2)}, 75th ${nn[Math.floor(nn.length * .75)].toFixed(2)}`)

const photo = make(1560, 1040, (x, y) => [
  120 + Math.round(90 * Math.sin(x / 40) * Math.cos(y / 55)),
  110 + Math.round(80 * Math.sin((x + y) / 60)),
  140 + Math.round(80 * Math.cos(x / 30 + y / 70)), 255])

function gridOf(img: ImageData, canvas: number, o: Partial<PixelateOptions>) {
  const { width, height } = fitGrid(img.width, img.height, canvas)
  return pixelate(img, width, height, 'average', opts(o))
}

console.log('\n--- boundary handling: how much does a cell colour actually move? ---')
const gSnap = gridOf(photo, 104, { boundary: 'snap' })
const gExact = gridOf(photo, 104, { boundary: 'exact' })
const deltas: number[] = []
for (let i = 0; i < gSnap.width * gSnap.height; i++) {
  if (!gSnap.opaque[i]) continue
  const a = rgbToLab(gSnap.colors[i * 3], gSnap.colors[i * 3 + 1], gSnap.colors[i * 3 + 2])
  const b = rgbToLab(gExact.colors[i * 3], gExact.colors[i * 3 + 1], gExact.colors[i * 3 + 2])
  deltas.push(ciede2000(a, b))
}
deltas.sort((x, y) => x - y)
const mean = deltas.reduce((s, v) => s + v, 0) / deltas.length
console.log(`  cell colour shift: mean ${mean.toFixed(2)} dE, median ${deltas[deltas.length >> 1].toFixed(2)}, max ${deltas[deltas.length - 1].toFixed(2)}`)
console.log(`  palette step is ${medianStep.toFixed(2)} dE, so a typical shift is ${(mean / medianStep).toFixed(2)}x the step`)
const cSnap = buildChart(gSnap), cExact = buildChart(gExact)
let changed = 0
for (let i = 0; i < cSnap.cells.length; i++) if (cSnap.cells[i] !== cExact.cells[i]) changed++
console.log(`  beads that actually changed: ${changed}/${cSnap.cells.length} (${(100 * changed / cSnap.cells.length).toFixed(1)}%)`)

console.log('\n--- alpha threshold: on an image with no alpha channel ---')
const cLo = buildChart(gridOf(photo, 104, { alphaThreshold: 0.1 }))
const cHi = buildChart(gridOf(photo, 104, { alphaThreshold: 0.9 }))
console.log(`  0.10 -> ${cLo.totalBeads} beads, 0.90 -> ${cHi.totalBeads} beads (identical: ${cLo.totalBeads === cHi.totalBeads})`)

console.log('\n--- alpha threshold: on an image WITH a soft alpha edge ---')
const soft = make(1040, 1040, (x, y) => {
  const d = Math.hypot(x - 520, y - 520)
  const a = Math.max(0, Math.min(255, Math.round((470 - d) * 255 / 24)))   // ~24px feathered rim
  return [220, 90, 70, a]
})
let prev = -1
for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
  const c = buildChart(gridOf(soft, 104, { alphaThreshold: t }))
  const delta = prev < 0 ? '' : `  (${c.totalBeads - prev >= 0 ? '+' : ''}${c.totalBeads - prev})`
  console.log(`  threshold ${t.toFixed(2)} -> ${c.totalBeads} beads${delta}`)
  prev = c.totalBeads
}
const hard = make(1040, 1040, (x, y) => {
  const d = Math.hypot(x - 520, y - 520)
  return [220, 90, 70, d < 470 ? 255 : 0]     // 1px hard edge, the common case
})
console.log('  same shape with a hard 1px edge (typical PNG cutout):')
for (const t of [0.1, 0.5, 0.9]) {
  console.log(`    threshold ${t.toFixed(2)} -> ${buildChart(gridOf(hard, 104, { alphaThreshold: t })).totalBeads} beads`)
}
