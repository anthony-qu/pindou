/** Stage A of the pipeline: full-resolution image -> grid of true colours.
 *
 *  This is the expensive stage and it runs once per image + settings change.
 *  Its output is cached so that stage B (palette matching) and stage C
 *  (simplification) can re-run freely without re-reading the image.
 */

import { SRGB_TO_LINEAR, labToRgb, linearToSrgb, rgbToLab } from './color'
import { axisWeights, type Boundary, type Kernel } from './kernel'
export type { Boundary, Kernel } from './kernel'

/** How the representative colour of the winning bucket is chosen. */
export type Refine = 'mean' | 'centre'

export type SampleMethod = 'average' | 'sharp'

/** Space in which cell colours are averaged.
 *
 *  `srgb` averages the encoded byte values, which is not averaging light: a
 *  cell half black and half white averages to L* 53 rather than the correct
 *  L* 76. `linear` fixes that. `lab` averages perceptually instead, which is
 *  what the palette matcher downstream actually measures distance in.
 */
export type ColorSpace = 'srgb' | 'linear' | 'lab'

export interface PixelateOptions {
  /** Weighting of source pixels within a cell. */
  kernel: Kernel
  /** Whether partially covered edge pixels are weighted by their coverage. */
  boundary: Boundary
  /** Bins within this Chebyshev radius are pooled before picking the winner,
   *  so two near-identical colours that straddle a bin edge are not split.
   *  0 disables pooling. */
  binMerge: number
  /** Representative colour of the winning bucket: its mean, or the bin centre. */
  refine: Refine
  space: ColorSpace
  /** Bits per channel when bucketing colours for `sharp`. Bin width = 2^(8-bits). */
  quantBits: number
  /** Fraction of a cell the dominant bucket must cover for `sharp` to use it.
   *  Below this the cell has no dominant colour and is averaged instead.
   *  0 disables the fallback, so the mode always wins. */
  dominance: number
  /** Mean coverage a cell needs before it gets a bead at all. */
  alphaThreshold: number
  /** Saturation multiplier applied before reduction. */
  saturation: number
  /** Grid origin offset, in cells. Matters when the source is already pixel art. */
  phaseX: number
  phaseY: number
}

/** Reproduces the behaviour the app shipped with. */
export const DEFAULT_PIXELATE: PixelateOptions = {
  kernel: 'box',
  boundary: 'snap',
  binMerge: 0,
  refine: 'mean',
  space: 'srgb',
  quantBits: 4,
  dominance: 0,
  alphaThreshold: 0.5,
  saturation: 1,
  phaseX: 0,
  phaseY: 0,
}

export interface ColorGrid {
  width: number
  height: number
  /** 3 bytes per cell: r, g, b. Meaningless where `opaque` is 0. */
  colors: Uint8ClampedArray
  /** 1 = place a bead here, 0 = leave the hole empty. */
  opaque: Uint8Array
}

/** Canvas presets, in beads. Square boards; the image is fitted inside. */
export const CANVAS_SIZES = [52, 78, 104] as const
export type CanvasSize = (typeof CANVAS_SIZES)[number]

/** Largest grid with the image's aspect ratio that fits inside a square canvas. */
export function fitGrid(imgW: number, imgH: number, canvas: number) {
  const scale = Math.min(canvas / imgW, canvas / imgH)
  return {
    width: Math.max(1, Math.min(canvas, Math.round(imgW * scale))),
    height: Math.max(1, Math.min(canvas, Math.round(imgH * scale))),
  }
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)

export function pixelate(
  img: ImageData,
  gridW: number,
  gridH: number,
  method: SampleMethod,
  opts: PixelateOptions = DEFAULT_PIXELATE,
): ColorGrid {
  const colors = new Uint8ClampedArray(gridW * gridH * 3)
  const opaque = new Uint8Array(gridW * gridH)
  const { data, width: sw, height: sh } = img

  const { space, dominance, alphaThreshold, saturation, kernel, boundary, refine } = opts
  const bits = Math.max(1, Math.min(8, Math.round(opts.quantBits)))
  const shift = 8 - bits
  const binW = 1 << shift
  const mask = (1 << bits) - 1
  const mergeR = Math.max(0, Math.round(opts.binMerge))
  const sat = saturation
  // 0/1/2 rather than the string: this is tested once per source pixel.
  const spaceId = space === 'linear' ? 1 : space === 'lab' ? 2 : 0
  const sharp = method === 'sharp'

  // Weights depend only on the column (or row), so they are computed once per
  // axis rather than once per cell. Phase shifts the sampling grid.
  const phaseOffX = Math.round(opts.phaseX * (sw / gridW))
  const phaseOffY = Math.round(opts.phaseY * (sh / gridH))
  const wx = axisWeights(gridW, sw, kernel, boundary)
  const wy = axisWeights(gridH, sh, kernel, boundary)

  interface Bucket { key: number; n: number; c0: number; c1: number; c2: number }
  const buckets = new Map<number, Bucket>()
  const list: Bucket[] = []

  for (let cy = 0; cy < gridH; cy++) {
    const ry = wy[cy]
    for (let cx = 0; cx < gridW; cx++) {
      const rx = wx[cx]

      let sumW = 0        // positive weight, for the coverage test
      let sumWA = 0       // weight x alpha, the mean's denominator
      let m0 = 0, m1 = 0, m2 = 0
      let opaqueW = 0
      if (sharp) { buckets.clear(); list.length = 0 }

      for (let iy = 0; iy < ry.w.length; iy++) {
        const py = ry.start + iy + phaseOffY
        if (py < 0 || py >= sh) continue
        const wyv = ry.w[iy]
        if (wyv === 0) continue

        for (let ix = 0; ix < rx.w.length; ix++) {
          const px = rx.start + ix + phaseOffX
          if (px < 0 || px >= sw) continue
          const w = wyv * rx.w[ix]
          if (w === 0) continue

          const i = (py * sw + px) * 4
          const a = data[i + 3] / 255
          if (w > 0) sumW += w
          sumWA += w * a
          if (a === 0) continue
          if (w > 0) opaqueW += w

          let R = data[i], G = data[i + 1], B = data[i + 2]
          if (sat !== 1) {
            // Rec.709 luma, so a boost rotates chroma outward without moving lightness.
            const lum = 0.2126 * R + 0.7152 * G + 0.0722 * B
            R = clamp255(lum + sat * (R - lum))
            G = clamp255(lum + sat * (G - lum))
            B = clamp255(lum + sat * (B - lum))
          }

          let v0: number, v1: number, v2: number
          if (spaceId === 1) {
            v0 = SRGB_TO_LINEAR[R | 0]; v1 = SRGB_TO_LINEAR[G | 0]; v2 = SRGB_TO_LINEAR[B | 0]
          } else if (spaceId === 2) {
            const lab = rgbToLab(R, G, B)
            v0 = lab.L; v1 = lab.a; v2 = lab.b
          } else {
            v0 = R; v1 = G; v2 = B
          }

          // The mean is always accumulated: `sharp` needs it for the
          // no-dominant-colour fallback.
          const wa = w * a
          m0 += v0 * wa; m1 += v1 * wa; m2 += v2 * wa

          if (sharp && w > 0) {
            const key = (((R | 0) >> shift) << (bits * 2)) | (((G | 0) >> shift) << bits) | ((B | 0) >> shift)
            const acc = buckets.get(key)
            if (acc) { acc.n += w; acc.c0 += v0 * w; acc.c1 += v1 * w; acc.c2 += v2 * w }
            else {
              const b = { key, n: w, c0: v0 * w, c1: v1 * w, c2: v2 * w }
              buckets.set(key, b); list.push(b)
            }
          }
        }
      }

      const cell = cy * gridW + cx
      if (sumW === 0 || sumWA / sumW < alphaThreshold) {
        opaque[cell] = 0
        continue
      }
      opaque[cell] = 1

      let o0: number, o1: number, o2: number
      let useMean = true

      if (sharp && list.length > 0 && opaqueW > 0) {
        let best: Bucket | undefined
        let bestScore = -Infinity
        let g0 = 0, g1 = 0, g2 = 0, gn = 0

        if (mergeR === 0) {
          for (const b of list) if (b.n > bestScore) { bestScore = b.n; best = b }
          if (best) { g0 = best.c0; g1 = best.c1; g2 = best.c2; gn = best.n }
        } else {
          // Pool each bin with its neighbours before choosing, so two nearly
          // identical colours split across a bin edge are not both beaten by a
          // third. Cells hold only a handful of bins, so the pairwise scan is cheap.
          for (const b of list) {
            const br = b.key >> (bits * 2), bg = (b.key >> bits) & mask, bb = b.key & mask
            let score = 0
            for (const o of list) {
              const or = o.key >> (bits * 2), og = (o.key >> bits) & mask, ob = o.key & mask
              if (Math.abs(or - br) <= mergeR && Math.abs(og - bg) <= mergeR && Math.abs(ob - bb) <= mergeR) {
                score += o.n
              }
            }
            if (score > bestScore) { bestScore = score; best = b }
          }
          if (best) {
            const br = best.key >> (bits * 2), bg = (best.key >> bits) & mask, bb = best.key & mask
            for (const o of list) {
              const or = o.key >> (bits * 2), og = (o.key >> bits) & mask, ob = o.key & mask
              if (Math.abs(or - br) <= mergeR && Math.abs(og - bg) <= mergeR && Math.abs(ob - bb) <= mergeR) {
                g0 += o.c0; g1 += o.c1; g2 += o.c2; gn += o.n
              }
            }
          }
        }

        if (best && bestScore / opaqueW >= dominance) {
          useMean = false
          if (refine === 'centre') {
            // The winning bin's centre, so the output is quantised to the bin
            // grid: this is what makes the bin width itself visible.
            const cr = (best.key >> (bits * 2)) * binW + binW / 2
            const cg = ((best.key >> bits) & mask) * binW + binW / 2
            const cb = (best.key & mask) * binW + binW / 2
            if (spaceId === 1) { o0 = SRGB_TO_LINEAR[cr | 0]; o1 = SRGB_TO_LINEAR[cg | 0]; o2 = SRGB_TO_LINEAR[cb | 0] }
            else if (spaceId === 2) { const l = rgbToLab(cr, cg, cb); o0 = l.L; o1 = l.a; o2 = l.b }
            else { o0 = cr; o1 = cg; o2 = cb }
          } else {
            o0 = g0 / gn; o1 = g1 / gn; o2 = g2 / gn
          }
        }
      }

      if (useMean) {
        const d = sumWA || 1
        o0 = m0 / d; o1 = m1 / d; o2 = m2 / d
      }

      let r: number, g: number, b: number
      if (spaceId === 1) {
        r = linearToSrgb(o0!); g = linearToSrgb(o1!); b = linearToSrgb(o2!)
      } else if (spaceId === 2) {
        const rgb = labToRgb(o0!, o1!, o2!)
        r = rgb.r; g = rgb.g; b = rgb.b
      } else {
        r = o0!; g = o1!; b = o2!
      }

      colors[cell * 3] = r
      colors[cell * 3 + 1] = g
      colors[cell * 3 + 2] = b
    }
  }

  return { width: gridW, height: gridH, colors, opaque }
}
