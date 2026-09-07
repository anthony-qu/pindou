/** Stage B of the pipeline: grid of true colours -> grid of Mard bead codes. */

import type { ColorGrid } from './pixelate'
import { BeadMatcher, PALETTE, type Bead } from './palette'

/** Value stored in `cells` for a hole with no bead. */
export const EMPTY = -1

export interface BeadCount {
  bead: Bead
  count: number
}

export interface BeadChart {
  width: number
  height: number
  /** Index into PALETTE per cell, or EMPTY. */
  cells: Int16Array
  /** Beads actually used, most-used first. */
  counts: BeadCount[]
  /** Cells that hold a bead. */
  totalBeads: number
}

export function buildChart(grid: ColorGrid, matcher = new BeadMatcher()): BeadChart {
  const { width, height, colors, opaque } = grid
  const cells = new Int16Array(width * height)
  const tally = new Map<number, number>()

  for (let i = 0; i < width * height; i++) {
    if (!opaque[i]) {
      cells[i] = EMPTY
      continue
    }
    const bead = matcher.match(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2])
    cells[i] = bead.index
    tally.set(bead.index, (tally.get(bead.index) ?? 0) + 1)
  }

  const counts: BeadCount[] = [...tally.entries()]
    .map(([index, count]) => ({ bead: PALETTE[index], count }))
    // Most-used first; ties fall back to chart order so the list is stable.
    .sort((a, b) => b.count - a.count || a.bead.index - b.bead.index)

  let totalBeads = 0
  for (const c of counts) totalBeads += c.count

  return { width, height, cells, counts, totalBeads }
}
