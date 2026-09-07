/** Stage C: make a matched chart actually beadable.
 *
 *  Two independent operations, deliberately not combined:
 *
 *    1. `buildMergePlan` / `applyMerges` collapse perceptually similar bead
 *       codes. This is what turns ten near-identical darks in a shaded area
 *       into one or two codes.
 *    2. `removeIslands` absorbs small connected blobs into their surroundings.
 *       This is what removes scattered one-off beads.
 *
 *  Neither blurs. Flat areas and hard edges are untouched by both.
 *
 *  Both run on an already-matched chart, so a slider stop is a real event
 *  ("B14 absorbed into G8") and the number shown is literally how many bead
 *  codes you have to buy.
 */

import { ciede2000 } from './color'
import { PALETTE } from './palette'
import { EMPTY, type BeadChart, type BeadCount } from './chart'

export interface MergeStep {
  /** Palette index that disappears. */
  from: number
  /** Palette index that absorbs it. */
  into: number
  /** Distinct colours remaining once this step has been applied. */
  remaining: number
}

export interface MergePlan {
  steps: MergeStep[]
  /** Colours in the chart before any merging. */
  initialCount: number
}

/** Orders every possible merge, cheapest first.
 *
 *  Cost is a Ward-style criterion: perceptual distance scaled by the harmonic
 *  size of the two groups. Two near-identical codes merge early; so does a
 *  barely-used code next to a dominant one. A large block of a distinctive
 *  colour survives to the end, which is what keeps deliberate detail alive.
 *
 *  Computed once per chart. The slider is then just an index into `steps`, so
 *  every stop is instant and the sequence is stable as you drag back and forth.
 */
export function buildMergePlan(counts: BeadCount[]): MergePlan {
  const n = counts.length
  const plan: MergePlan = { steps: [], initialCount: n }
  if (n < 2) return plan

  const idx = counts.map((c) => c.bead.index)
  const size = new Float64Array(n)
  counts.forEach((c, i) => { size[i] = c.count })
  const alive = new Uint8Array(n).fill(1)

  // Squared CIEDE2000 between every pair. Bead colours never change, so this
  // is computed once; only the group sizes evolve.
  const d2 = new Float64Array(n * n)
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = ciede2000(PALETTE[idx[i]].lab, PALETTE[idx[j]].lab)
      d2[i * n + j] = d2[j * n + i] = d * d
    }
  }

  for (let step = 0; step < n - 1; step++) {
    let bi = -1, bj = -1, best = Infinity
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue
      for (let j = i + 1; j < n; j++) {
        if (!alive[j]) continue
        const si = size[i], sj = size[j]
        const cost = d2[i * n + j] * ((si * sj) / (si + sj))
        if (cost < best) { best = cost; bi = i; bj = j }
      }
    }
    if (bi < 0) break

    // The larger group absorbs the smaller, so the dominant colour of an area
    // is the one that survives. Ties fall to the earlier chart position.
    let keep = bi, drop = bj
    if (size[bj] > size[bi] || (size[bj] === size[bi] && idx[bj] < idx[bi])) {
      keep = bj; drop = bi
    }

    plan.steps.push({ from: idx[drop], into: idx[keep], remaining: n - step - 1 })
    size[keep] += size[drop]
    alive[drop] = 0
  }

  return plan
}

/** Resolves a chain of merges (A into B, later B into C) to its final target. */
function resolver(plan: MergePlan, steps: number): Int32Array {
  const map = new Int32Array(PALETTE.length)
  for (let i = 0; i < map.length; i++) map[i] = i
  for (let s = 0; s < steps && s < plan.steps.length; s++) {
    const { from, into } = plan.steps[s]
    map[from] = into
  }
  // Path-compress so lookup is a single read per cell.
  for (let i = 0; i < map.length; i++) {
    let r = i
    while (map[r] !== r) r = map[r]
    map[i] = r
  }
  return map
}

export function applyMerges(cells: Int16Array, plan: MergePlan, steps: number): Int16Array {
  if (steps <= 0) return cells
  const map = resolver(plan, steps)
  const out = new Int16Array(cells.length)
  for (let i = 0; i < cells.length; i++) {
    out[i] = cells[i] === EMPTY ? EMPTY : map[cells[i]]
  }
  return out
}

/** Absorbs connected blobs smaller than `minSize` into the colour that
 *  surrounds them.
 *
 *  Uses 8-connectivity on purpose: under 4-connectivity a single-bead-wide
 *  diagonal line reads as a string of isolated dots and would be destroyed,
 *  and diagonal outlines are everywhere in this kind of art.
 *
 *  Holes are never filled and never absorb anything; they are not a colour.
 */
export function removeIslands(
  cells: Int16Array,
  width: number,
  height: number,
  minSize: number,
): Int16Array {
  if (minSize <= 1) return cells

  let cur = Int16Array.from(cells)
  const seen = new Uint8Array(width * height)
  const stack: number[] = []
  const blob: number[] = []

  // Reassignment can expose new small blobs, so repeat until stable. The cap
  // keeps a pathological image from looping for long.
  for (let pass = 0; pass < 4; pass++) {
    seen.fill(0)
    let changed = false

    for (let start = 0; start < cur.length; start++) {
      if (seen[start] || cur[start] === EMPTY) continue
      const code = cur[start]

      blob.length = 0
      stack.length = 0
      stack.push(start)
      seen[start] = 1

      while (stack.length) {
        const p = stack.pop()!
        blob.push(p)
        const px = p % width, py = (p / width) | 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue
            const nx = px + dx, ny = py + dy
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
            const q = ny * width + nx
            if (seen[q] || cur[q] !== code) continue
            seen[q] = 1
            stack.push(q)
          }
        }
      }

      if (blob.length >= minSize) continue

      // Absorb into whichever neighbouring colour touches the blob most.
      const touching = new Map<number, number>()
      for (const p of blob) {
        const px = p % width, py = (p / width) | 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue
            const nx = px + dx, ny = py + dy
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
            const n = cur[ny * width + nx]
            if (n === EMPTY || n === code) continue
            touching.set(n, (touching.get(n) ?? 0) + 1)
          }
        }
      }
      if (!touching.size) continue

      let win = -1, winN = -1
      for (const [n, c] of touching) {
        if (c > winN || (c === winN && n < win)) { win = n; winN = c }
      }
      for (const p of blob) cur[p] = win
      changed = true
    }

    if (!changed) break
  }

  return cur
}

/** Recounts a chart after its cells have been rewritten. */
export function recount(cells: Int16Array): { counts: BeadCount[]; totalBeads: number } {
  const tally = new Map<number, number>()
  let totalBeads = 0
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === EMPTY) continue
    totalBeads++
    tally.set(cells[i], (tally.get(cells[i]) ?? 0) + 1)
  }
  const counts = [...tally.entries()]
    .map(([index, count]) => ({ bead: PALETTE[index], count }))
    .sort((a, b) => b.count - a.count || a.bead.index - b.bead.index)
  return { counts, totalBeads }
}

/** Stage C end to end. Cheap enough to re-run on every slider movement. */
export function simplify(
  base: BeadChart,
  plan: MergePlan,
  mergeSteps: number,
  minIsland: number,
): BeadChart {
  let cells = applyMerges(base.cells, plan, mergeSteps)
  cells = removeIslands(cells, base.width, base.height, minIsland)
  const { counts, totalBeads } = recount(cells)
  return { width: base.width, height: base.height, cells, counts, totalBeads }
}
