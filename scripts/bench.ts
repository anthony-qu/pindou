import { pixelate } from '../src/lib/pixelate'
import { buildChart } from '../src/lib/chart'

// Genuine worst case: every one of the 10,816 cells averages to a different
// colour, so the matcher's per-colour cache never helps.
const N = 104, BLOCK = 10, SW = N * BLOCK
const img = { data: new Uint8ClampedArray(SW * SW * 4), width: SW, height: SW } as ImageData
let seed = 12345
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 8) % 256
for (let cy = 0; cy < N; cy++) for (let cx = 0; cx < N; cx++) {
  const r = rnd(), g = rnd(), b = rnd()
  for (let y = 0; y < BLOCK; y++) for (let x = 0; x < BLOCK; x++) {
    const i = ((cy * BLOCK + y) * SW + cx * BLOCK + x) * 4
    img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255
  }
}
for (const method of ['average', 'sharp'] as const) {
  let t = Date.now(); const grid = pixelate(img, N, N, method); const tp = Date.now() - t
  t = Date.now(); const chart = buildChart(grid); const tm = Date.now() - t
  console.log(`${method.padEnd(8)} pixelate ${String(tp).padStart(4)}ms  match ${String(tm).padStart(4)}ms  total ${String(tp + tm).padStart(4)}ms  distinct colours used: ${chart.counts.length}`)
}
