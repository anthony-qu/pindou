/** Resampling kernels for the downsampler.
 *
 *  Each kernel is a function of `t`, the distance from the cell centre measured
 *  in cells, so the sample spacing is always 1. `box` is the original
 *  behaviour: uniform weight over the cell and nothing outside it.
 *
 *  Mitchell and Lanczos reach beyond the cell and go negative there, which is
 *  what sharpens edges — and what makes them ring. That is inherent to the
 *  kernel, not a bug.
 */

export type Kernel = 'box' | 'tent' | 'gaussian' | 'mitchell' | 'lanczos'

/** Support radius in cells. A wider radius means more source pixels per cell. */
export const KERNEL_RADIUS: Record<Kernel, number> = {
  box: 0.5,
  tent: 1,
  gaussian: 1.5,
  mitchell: 2,
  lanczos: 2,
}

const GAUSS_SIGMA = 0.4
const MITCHELL_B = 1 / 3
const MITCHELL_C = 1 / 3

export function kernelWeight(k: Kernel, t: number): number {
  const a = Math.abs(t)
  switch (k) {
    case 'box':
      return a <= 0.5 ? 1 : 0
    case 'tent':
      return a < 1 ? 1 - a : 0
    case 'gaussian':
      return a < 1.5 ? Math.exp(-(t * t) / (2 * GAUSS_SIGMA * GAUSS_SIGMA)) : 0
    case 'mitchell': {
      const B = MITCHELL_B, C = MITCHELL_C
      const a2 = a * a, a3 = a2 * a
      if (a < 1) return ((12 - 9 * B - 6 * C) * a3 + (-18 + 12 * B + 6 * C) * a2 + (6 - 2 * B)) / 6
      if (a < 2) return ((-B - 6 * C) * a3 + (6 * B + 30 * C) * a2 + (-12 * B - 48 * C) * a + (8 * B + 24 * C)) / 6
      return 0
    }
    case 'lanczos': {
      if (a >= 2) return 0
      if (a < 1e-9) return 1
      const pt = Math.PI * t
      return ((Math.sin(pt) / pt) * (Math.sin(pt / 2) / (pt / 2)))
    }
  }
}

/** How cell edges are handled.
 *
 *  `snap` rounds the support to whole pixels, so a cell 15.38 pixels wide takes
 *  15 or 16 whole pixels and the odd fraction lands entirely on one side.
 *  `exact` weights the partially covered pixels at each edge by how much of
 *  them the cell actually covers.
 */
export type Boundary = 'snap' | 'exact'

/** Fraction of the pixel [i, i+1] that lies inside [lo, hi]. */
export function overlapFraction(i: number, lo: number, hi: number): number {
  const v = Math.min(i + 1, hi) - Math.max(i, lo)
  return v <= 0 ? 0 : v >= 1 ? 1 : v
}

/** Precomputed weights along one axis, shared by every cell in that row/column. */
export interface AxisWeights {
  start: number
  /** weight per source pixel, starting at `start` */
  w: Float64Array
}

export function axisWeights(
  cells: number, source: number, kernel: Kernel, boundary: Boundary,
): AxisWeights[] {
  const cell = source / cells
  const radius = KERNEL_RADIUS[kernel] * cell
  const out: AxisWeights[] = []

  // The default pairing reproduces the original integer tiling exactly: cells
  // partition the axis with no gaps or overlap and every pixel weighs the same.
  // Kept as its own branch so the default output is bit-identical, and because
  // it is also the cheapest to evaluate.
  if (kernel === 'box' && boundary === 'snap') {
    for (let c = 0; c < cells; c++) {
      const start = Math.min(source, Math.max(0, Math.floor((c * source) / cells)))
      const end = Math.min(source, Math.max(start + 1, Math.floor(((c + 1) * source) / cells)))
      out.push({ start, w: new Float64Array(Math.max(0, end - start)).fill(1) })
    }
    return out
  }

  for (let c = 0; c < cells; c++) {
    const centre = (c + 0.5) * cell
    const lo = centre - radius
    const hi = centre + radius
    const start = Math.max(0, Math.floor(lo))
    const end = Math.min(source, Math.ceil(hi))
    const n = Math.max(1, end - start)
    const w = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      const px = start + i
      let v: number
      if (boundary === 'exact') {
        // Evaluate the kernel at the centroid of the part of the pixel the
        // support actually covers, weighted by how much that is. Evaluating at
        // the pixel centre instead would drop any pixel whose centre falls
        // outside the support but which still overlaps it — so `exact` would
        // down-weight pixels sticking out of the cell while discarding the ones
        // sticking in. For box this reduces to plain area weighting.
        const a0 = Math.max(px, lo)
        const b0 = Math.min(px + 1, hi)
        const cover = b0 - a0
        v = cover <= 0 ? 0 : kernelWeight(kernel, ((a0 + b0) / 2 - centre) / cell) * cover
      } else {
        v = kernelWeight(kernel, (px + 0.5 - centre) / cell)
      }
      w[i] = v
    }
    out.push({ start, w })
  }
  return out
}
