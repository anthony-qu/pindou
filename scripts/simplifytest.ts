import { pixelate } from '../src/lib/pixelate'
import { buildChart, EMPTY } from '../src/lib/chart'
import { buildMergePlan, simplify, removeIslands } from '../src/lib/simplify'
import { PALETTE } from '../src/lib/palette'

let fails = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) fails++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

// A shaded dark area made of many near-identical darks, a flat light area,
// and a handful of scattered stray beads dropped into the dark region.
const G = 40, BLOCK = 8, SW = G * BLOCK
const img = { data: new Uint8ClampedArray(SW * SW * 4), width: SW, height: SW } as ImageData
let seed = 99
const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 9) % n

const strays = new Set<string>()
for (let cy = 0; cy < G; cy++) for (let cx = 0; cx < G; cx++) {
  let r: number, g: number, b: number
  if (cx < G / 2) {
    // Ten slightly different darks, the kind a shaded area produces.
    const k = rnd(10)
    r = 34 + k * 9; g = 28 + k * 8; b = 26 + k * 7
  } else {
    r = 236; g = 228; b = 210
  }
  // Scatter a few isolated bright beads through the dark half.
  if (cx < G / 2 && rnd(28) === 0) { r = 230; g = 60; b = 60; strays.add(`${cx},${cy}`) }
  for (let y = 0; y < BLOCK; y++) for (let x = 0; x < BLOCK; x++) {
    const i = ((cy * BLOCK + y) * SW + cx * BLOCK + x) * 4
    img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255
  }
}

const base = buildChart(pixelate(img, G, G, 'sharp'))
let t = Date.now()
const plan = buildMergePlan(base.counts)
const tPlan = Date.now() - t

console.log(`\nbase chart: ${base.counts.length} colours, ${strays.size} stray beads planted`)
console.log(`merge plan built in ${tPlan}ms (${plan.steps.length} steps)\n`)

console.log('slider walk (merge only, no island cleanup):')
const seen = new Set<number>()
for (let s = 0; s <= plan.steps.length; s++) {
  const c = simplify(base, plan, s, 0)
  if (!seen.has(c.counts.length)) {
    seen.add(c.counts.length)
    if (c.counts.length <= 12 || s === 0)
      console.log(`  ${String(s).padStart(3)} merges -> ${String(c.counts.length).padStart(3)} colours   ${c.counts.slice(0, 6).map(x => x.bead.code).join(' ')}`)
  }
}

// Every stop must reduce the count by exactly one: the slider is discrete.
let monotone = true
for (let s = 0; s < plan.steps.length; s++) {
  if (simplify(base, plan, s, 0).counts.length - simplify(base, plan, s + 1, 0).counts.length !== 1) monotone = false
}
check('every slider stop removes exactly one colour', monotone)

// The user's actual ask: a shaded dark area collapses to 1-3 codes.
const toThree = simplify(base, plan, plan.initialCount - 3, 0)
const darkCodes = new Set<number>()
for (let y = 0; y < G; y++) for (let x = 0; x < G / 2; x++) {
  const v = toThree.cells[y * G + x]
  if (v !== EMPTY) darkCodes.add(v)
}
check('dark area collapses to few codes', darkCodes.size <= 3,
  `${darkCodes.size} codes: ${[...darkCodes].map(i => PALETTE[i].code).join(' ')}`)

// Flat light half must survive untouched — merging must not blur.
const lightCodes = new Set<number>()
for (let y = 0; y < G; y++) for (let x = G / 2; x < G; x++) lightCodes.add(toThree.cells[y * G + x])
check('flat light area stays one colour', lightCodes.size === 1,
  `${lightCodes.size} code(s)`)

console.log('\nisland cleanup (no merging):')
for (const min of [0, 2, 3, 5]) {
  const c = simplify(base, plan, 0, min)
  let survivingStrays = 0
  for (const key of strays) {
    const [cx, cy] = key.split(',').map(Number)
    const bead = PALETTE[c.cells[cy * G + cx]]
    if (bead && bead.lab.a > 25) survivingStrays++   // still a saturated red
  }
  console.log(`  minSize ${min} -> ${String(c.counts.length).padStart(3)} colours, ${survivingStrays}/${strays.size} stray cells left`)
  if (min === 2) check('minSize 2 clears lone beads but spares touching pairs', survivingStrays < strays.size)
  if (min >= 3) check(`minSize ${min} clears the scattered beads`, survivingStrays === 0)
}

// Cleanup must not eat a deliberate solid block of the same size class.
const solid = Int16Array.from(base.cells)
const blockCode = base.counts[base.counts.length - 1].bead.index
for (let y = 5; y < 9; y++) for (let x = 5; x < 9; x++) solid[y * G + x] = blockCode
const cleaned = removeIslands(solid, G, G, 5)
let intact = 0
for (let y = 5; y < 9; y++) for (let x = 5; x < 9; x++) if (cleaned[y * G + x] === blockCode) intact++
check('a deliberate 4x4 block survives cleanup', intact === 16, `${intact}/16 cells kept`)

// Worst realistic case: a photo-like chart with many colours at 104x104.
const N = 104, B2 = 6, SW2 = N * B2
const photo = { data: new Uint8ClampedArray(SW2 * SW2 * 4), width: SW2, height: SW2 } as ImageData
for (let cy = 0; cy < N; cy++) for (let cx = 0; cx < N; cx++) {
  const r = 120 + Math.round(90 * Math.sin(cx / 9) * Math.cos(cy / 11))
  const g = 110 + Math.round(80 * Math.sin((cx + cy) / 13))
  const b = 140 + Math.round(80 * Math.cos(cx / 7 + cy / 17))
  for (let y = 0; y < B2; y++) for (let x = 0; x < B2; x++) {
    const i = ((cy * B2 + y) * SW2 + cx * B2 + x) * 4
    photo.data[i] = r; photo.data[i + 1] = g; photo.data[i + 2] = b; photo.data[i + 3] = 255
  }
}
const pBase = buildChart(pixelate(photo, N, N, 'average'))
t = Date.now(); const pPlan = buildMergePlan(pBase.counts); const tp = Date.now() - t
t = Date.now(); const p24 = simplify(pBase, pPlan, pBase.counts.length - 24, 3); const ts = Date.now() - t
console.log(`\nphoto-like 104x104: ${pBase.counts.length} colours`)
console.log(`  plan: ${tp}ms (once)   slider move to 24 colours + cleanup: ${ts}ms   -> ${p24.counts.length} colours`)
check('plan build is fast enough to be invisible', tp < 700, `${tp}ms`)
check('slider move stays interactive', ts < 120, `${ts}ms`)

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILURES`)
process.exit(fails ? 1 : 0)
