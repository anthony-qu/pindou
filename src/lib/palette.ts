/** The Mard palette and the nearest-bead matcher. */

import raw from '../data/mardPalette.json'
import { ciede2000, deltaE76Sq, hexToRgb, rgbToLab, type Lab } from './color'

export interface Bead {
  code: string
  hex: string
  series: string
  rgb: { r: number; g: number; b: number }
  lab: Lab
  /** Canonical position in the chart. Also the deterministic tie-break order. */
  index: number
}

/** Series this build does not stock.
 *
 *  The extended Mard series are specialty beads — glitter, glow-in-the-dark,
 *  transparent — which a colour chart cannot honestly represent, and which
 *  this build has no supply of. Matching against them would produce charts
 *  that cannot be made.
 *
 *  Excluding all six leaves the 221 standard colours the source chart
 *  advertises: A-H plus M.
 */
export const EXCLUDED_SERIES_PREFIXES = ['P', 'Q', 'R', 'T', 'Y', 'Z'] as const

/** Every code on the Mard chart, including the ones not stocked. Kept so the
 *  exclusion is one array away from being changed. */
export const ALL_BEADS = raw as { code: string; hex: string; series: string }[]

/** The 221 standard beads used for matching, in chart order.
 *
 *  Removing the extended series also removes every duplicate colour the chart
 *  contained — the nine identical whites (H2 plus the ZG glow series) and the
 *  Q4/R11 pair were all in the excluded series, so matching no longer has ties
 *  to break at all.
 */
export const PALETTE: Bead[] = ALL_BEADS
  .filter((b) => !(EXCLUDED_SERIES_PREFIXES as readonly string[]).includes(b.series[0]))
  .map((b, index) => {
    const rgb = hexToRgb(b.hex)
    return { ...b, rgb, lab: rgbToLab(rgb.r, rgb.g, rgb.b), index }
  })

export const BY_CODE = new Map(PALETTE.map((b) => [b.code, b]))

/** How many CIE76 candidates get re-ranked with the expensive metric.
 *
 *  Full CIEDE2000 against every bead for each cell is millions of evaluations
 *  on a 104x104 chart, which is slow enough to feel. Shortlisting by cheap squared
 *  Lab distance and re-ranking only the closest few is indistinguishable in
 *  output and roughly an order of magnitude faster.
 */
const SHORTLIST = 16

export class BeadMatcher {
  private readonly beads: Bead[]
  private readonly cache = new Map<number, Bead>()

  // Reused across calls so matching a whole chart allocates nothing per cell.
  private readonly nearD = new Float64Array(SHORTLIST)
  private readonly nearI = new Int32Array(SHORTLIST)

  constructor(beads: Bead[] = PALETTE) {
    if (beads.length === 0) throw new Error('BeadMatcher needs at least one bead')
    this.beads = beads
  }

  /** Nearest bead to an sRGB colour. Cached per exact colour. */
  match(r: number, g: number, b: number): Bead {
    const key = (r << 16) | (g << 8) | b
    const hit = this.cache.get(key)
    if (hit) return hit

    const lab = rgbToLab(r, g, b)
    const { beads, nearD, nearI } = this
    const k = Math.min(SHORTLIST, beads.length)

    // Stage 1: keep the k nearest by cheap squared Lab distance, held in a
    // sorted insert buffer. The common case is one comparison per bead.
    let filled = 0
    let worst = Infinity
    for (let i = 0; i < beads.length; i++) {
      const d = deltaE76Sq(lab, beads[i].lab)
      if (filled === k && d >= worst) continue
      let j = filled < k ? filled++ : k - 1
      while (j > 0 && nearD[j - 1] > d) {
        nearD[j] = nearD[j - 1]
        nearI[j] = nearI[j - 1]
        j--
      }
      nearD[j] = d
      nearI[j] = i
      worst = nearD[filled - 1]
    }

    // Stage 2: re-rank the shortlist with CIEDE2000. The stocked palette holds
    // no duplicate colours, but the tie-break is kept so the ordering stays
    // deterministic if the excluded series are ever restored.
    let best = beads[nearI[0]]
    let bestD = Infinity
    for (let i = 0; i < filled; i++) {
      const bead = beads[nearI[i]]
      const d = ciede2000(lab, bead.lab)
      if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && bead.index < best.index)) {
        bestD = d
        best = bead
      }
    }

    this.cache.set(key, best)
    return best
  }
}
