import { ciede2000, rgbToLab, type Lab } from '../src/lib/color'
import { ALL_BEADS, BeadMatcher, PALETTE } from '../src/lib/palette'
import { pixelate, fitGrid } from '../src/lib/pixelate'
import { buildChart } from '../src/lib/chart'

const L = (l: number, a: number, b: number): Lab => ({ L: l, a, b })
let fails = 0
const near = (name: string, got: number, want: number, tol: number) => {
  const ok = Math.abs(got - want) <= tol
  if (!ok) fails++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}: got ${got.toFixed(4)} want ${want.toFixed(4)}`)
}

// Sharma, Wu & Dalal (2005) CIEDE2000 reference pairs.
const cases: [Lab, Lab, number][] = [
  [L(50, 2.6772, -79.7751), L(50, 0, -82.7485), 2.0425],
  [L(50, 3.1571, -77.2803), L(50, 0, -82.7485), 2.8615],
  [L(50, 2.8361, -74.0200), L(50, 0, -82.7485), 3.4412],
  [L(50, -1.3802, -84.2814), L(50, 0, -82.7485), 1.0000],
  [L(50, -0.9009, -85.5211), L(50, 0, -82.7485), 1.0000],
  [L(50, 0, 0), L(50, -1, 2), 2.3669],
  [L(50, 2.4900, -0.0010), L(50, -2.4900, 0.0009), 7.1792],
  [L(50, 2.5, 0), L(50, 0, -2.5), 4.3065],
  [L(50, 2.5, 0), L(73, 25, -18), 27.1492],
  [L(50, 2.5, 0), L(61, -5, 29), 22.8977],
  [L(50, 2.5, 0), L(56, -27, -3), 31.9030],
  [L(60.2574, -34.0099, 36.2677), L(60.4626, -34.1751, 39.4387), 1.2644],
  [L(2.0776, 0.0795, -1.1350), L(0.9033, -0.0636, -0.5514), 0.9082],
]
console.log('— CIEDE2000 vs Sharma et al. reference —')
cases.forEach(([a, b, want], i) => near(`pair ${i + 1}`, ciede2000(a, b), want, 0.0002))

console.log('\n— sRGB -> Lab anchors —')
const white = rgbToLab(255, 255, 255)
near('white L', white.L, 100, 0.01); near('white a', white.a, 0, 0.01); near('white b', white.b, 0, 0.01)
const black = rgbToLab(0, 0, 0)
near('black L', black.L, 0, 0.01)
const mid = rgbToLab(128, 128, 128)
near('mid grey L', mid.L, 53.585, 0.05)

console.log('\n— palette —')
console.log(`${ALL_BEADS.length === 291 ? 'ok  ' : 'FAIL'}  chart holds 291 codes: ${ALL_BEADS.length}`)
if (ALL_BEADS.length !== 291) fails++
console.log(`${PALETTE.length === 222 ? 'ok  ' : 'FAIL'}  222 stocked after excluding P/Q/R/Y/Z: ${PALETTE.length}`)
if (PALETTE.length !== 222) fails++
const stray = PALETTE.filter((b) => ['P', 'Q', 'R', 'Y', 'Z'].includes(b.series[0]))
console.log(`${stray.length === 0 ? 'ok  ' : 'FAIL'}  no excluded series can be matched (${stray.length} leaked)`)
if (stray.length) fails++
const dupes = new Map<string, number>()
for (const b of PALETTE) dupes.set(b.hex, (dupes.get(b.hex) ?? 0) + 1)
const dupeList = [...dupes.entries()].filter(([, n]) => n > 1)
console.log(`${dupeList.length === 0 ? 'ok  ' : 'FAIL'}  stocked palette has no duplicate colours (${dupeList.length})`)
if (dupeList.length) fails++
console.log(`      indices are contiguous: ${PALETTE.every((b, i) => b.index === i)}`)
const m = new BeadMatcher()
const exact = PALETTE.filter((b) => m.match(b.rgb.r, b.rgb.g, b.rgb.b).hex !== b.hex)
console.log(`${exact.length === 0 ? 'ok  ' : 'FAIL'}  every bead matches its own hex (${exact.length} misses)`)
if (exact.length) fails++
console.log(`${m.match(255, 255, 255).code === 'H2' ? 'ok  ' : 'FAIL'}  pure white -> H2, not a ZG glow bead (got ${m.match(255, 255, 255).code})`)
if (m.match(255, 255, 255).code !== 'H2') fails++

console.log('\n— fitGrid —')
const f1 = fitGrid(1600, 1200, 104)
console.log(`${f1.width === 104 && f1.height === 78 ? 'ok  ' : 'FAIL'}  4:3 into 104 -> ${f1.width}x${f1.height}`)
const f2 = fitGrid(1000, 1000, 52)
console.log(`${f2.width === 52 && f2.height === 52 ? 'ok  ' : 'FAIL'}  square into 52 -> ${f2.width}x${f2.height}`)
const f3 = fitGrid(1920, 1080, 78)
console.log(`ok    16:9 into 78 -> ${f3.width}x${f3.height}`)

console.log('\n— full pipeline timing (worst case: 104x104, all-unique colours) —')
const SW = 1040
const img = { data: new Uint8ClampedArray(SW * SW * 4), width: SW, height: SW } as ImageData
for (let i = 0; i < SW * SW; i++) {
  img.data[i * 4] = (i * 7) % 256
  img.data[i * 4 + 1] = (i * 13) % 256
  img.data[i * 4 + 2] = (i * 29) % 256
  img.data[i * 4 + 3] = 255
}
let t = Date.now()
const grid = pixelate(img, 104, 104, 'average')
const tPix = Date.now() - t
t = Date.now()
const chart = buildChart(grid)
const tMatch = Date.now() - t
console.log(`pixelate: ${tPix}ms   match: ${tMatch}ms   colours used: ${chart.counts.length}   beads: ${chart.totalBeads}`)
if (chart.totalBeads !== 104 * 104) { console.log('FAIL  bead total wrong'); fails++ }

console.log('\n— transparency becomes holes —')
const t2 = { data: new Uint8ClampedArray(40 * 40 * 4), width: 40, height: 40 } as ImageData
for (let i = 0; i < 40 * 40; i++) {
  const opaque = (i % 40) < 20
  t2.data[i * 4] = 200; t2.data[i * 4 + 1] = 30; t2.data[i * 4 + 2] = 30
  t2.data[i * 4 + 3] = opaque ? 255 : 0
}
const c2 = buildChart(pixelate(t2, 20, 20, 'average'))
console.log(`${c2.totalBeads === 200 ? 'ok  ' : 'FAIL'}  half-transparent image -> ${c2.totalBeads}/400 beads`)
if (c2.totalBeads !== 200) fails++

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`)
process.exit(fails ? 1 : 0)
