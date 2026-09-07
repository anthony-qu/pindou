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

/** All 291 Mard codes, in chart order (A1..A26, B1.., .. ZG8).
 *
 *  Note: nine codes carry an identical #FFFFFF (H2 plus the whole ZG
 *  glow-in-the-dark series, whose real appearance a colour chart cannot show),
 *  and Q4/R11 are both #FFEBFA. Matching therefore has genuine ties, broken by
 *  `index` so that a white pixel always resolves to H2 rather than arbitrarily
 *  telling you to buy glow-in-the-dark beads.
 */
export const PALETTE: Bead[] = (raw as { code: string; hex: string; series: string }[]).map(
  (b, index) => {
    const rgb = hexToRgb(b.hex)
    return { ...b, rgb, lab: rgbToLab(rgb.r, rgb.g, rgb.b), index }
  },
)

export const BY_CODE = new Map(PALETTE.map((b) => [b.code, b]))

/** How many CIE76 candidates get re-ranked with the expensive metric.
 *
 *  Full CIEDE2000 against all 291 beads for every cell is ~3.1M evaluations on
 *  a 104x104 chart, which is slow enough to feel. Shortlisting by cheap squared
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

    // Stage 2: re-rank the shortlist with CIEDE2000. Ties (the palette holds
    // nine identical whites) break towards the lower chart index.
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
