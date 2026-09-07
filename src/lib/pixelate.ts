/** Stage A of the pipeline: full-resolution image -> grid of true colours.
 *
 *  This is the expensive stage and it runs once per image + settings change.
 *  Its output is cached so that stage B (palette matching) and stage C
 *  (simplification) can re-run freely without re-reading the image.
 */

import { SRGB_TO_LINEAR, labToRgb, linearToSrgb, rgbToLab } from './color'

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

  const { space, dominance, alphaThreshold, saturation, phaseX, phaseY } = opts
  const bits = Math.max(1, Math.min(8, Math.round(opts.quantBits)))
  const shift = 8 - bits
  const sat = saturation
  // 0/1/2 rather than the string: this is tested once per source pixel.
  const spaceId = space === 'linear' ? 1 : space === 'lab' ? 2 : 0
  const sharp = method === 'sharp'

  const offX = phaseX * (sw / gridW)
  const offY = phaseY * (sh / gridH)

  const buckets = new Map<number, { n: number; c0: number; c1: number; c2: number }>()

  for (let cy = 0; cy < gridH; cy++) {
    const y0 = Math.min(sh, Math.max(0, Math.floor((cy * sh) / gridH + offY)))
    const y1 = Math.min(sh, Math.max(y0 + 1, Math.floor(((cy + 1) * sh) / gridH + offY)))

    for (let cx = 0; cx < gridW; cx++) {
      const x0 = Math.min(sw, Math.max(0, Math.floor((cx * sw) / gridW + offX)))
      const x1 = Math.min(sw, Math.max(x0 + 1, Math.floor(((cx + 1) * sw) / gridW + offX)))

      let sumA = 0
      let n = 0
      let m0 = 0, m1 = 0, m2 = 0
      let nOpaque = 0
      if (sharp) buckets.clear()

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * sw + x) * 4
          const a = data[i + 3] / 255
          n++
          sumA += a
          if (a === 0) continue
          nOpaque++

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
          m0 += v0 * a; m1 += v1 * a; m2 += v2 * a

          if (sharp) {
            const key =
              (((R | 0) >> shift) << (bits * 2)) |
              (((G | 0) >> shift) << bits) |
              ((B | 0) >> shift)
            const acc = buckets.get(key)
            if (acc) { acc.n++; acc.c0 += v0; acc.c1 += v1; acc.c2 += v2 }
            else buckets.set(key, { n: 1, c0: v0, c1: v1, c2: v2 })
          }
        }
      }

      const cell = cy * gridW + cx
      if (n === 0 || sumA / n < alphaThreshold) {
        opaque[cell] = 0
        continue
      }
      opaque[cell] = 1

      // Pick the representative value, still in the working space.
      let o0: number, o1: number, o2: number
      let useMean = true
      if (sharp && nOpaque > 0) {
        let best: { n: number; c0: number; c1: number; c2: number } | undefined
        for (const acc of buckets.values()) if (!best || acc.n > best.n) best = acc
        if (best && best.n / nOpaque >= dominance) {
          useMean = false
          o0 = best.c0 / best.n; o1 = best.c1 / best.n; o2 = best.c2 / best.n
        }
      }
      if (useMean) {
        const w = sumA || 1
        o0 = m0 / w; o1 = m1 / w; o2 = m2 / w
      }

      // Back to sRGB bytes.
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
