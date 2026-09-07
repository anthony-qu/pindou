/** Stage A of the pipeline: full-resolution image -> grid of true colours.
 *
 *  This is the expensive stage and it runs once per image + canvas size. Its
 *  output is cached so that stage B (palette matching) can be re-run freely
 *  when palette constraints change, without re-reading the image.
 */

export type SampleMethod = 'average' | 'sharp'

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

/** A cell is beaded only if most of the pixels under it were opaque. */
const ALPHA_THRESHOLD = 0.5

/** Bits per channel when bucketing colours for the `sharp` method. */
const QUANT_BITS = 4

export function pixelate(
  img: ImageData,
  gridW: number,
  gridH: number,
  method: SampleMethod,
): ColorGrid {
  const colors = new Uint8ClampedArray(gridW * gridH * 3)
  const opaque = new Uint8Array(gridW * gridH)
  const { data, width: sw, height: sh } = img

  const shift = 8 - QUANT_BITS
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()

  for (let cy = 0; cy < gridH; cy++) {
    const y0 = Math.floor((cy * sh) / gridH)
    const y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * sh) / gridH))

    for (let cx = 0; cx < gridW; cx++) {
      const x0 = Math.floor((cx * sw) / gridW)
      const x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * sw) / gridW))

      let sumA = 0
      let n = 0
      let r = 0, g = 0, b = 0
      if (method === 'sharp') buckets.clear()

      for (let y = y0; y < y1 && y < sh; y++) {
        for (let x = x0; x < x1 && x < sw; x++) {
          const i = (y * sw + x) * 4
          const a = data[i + 3] / 255
          n++
          sumA += a
          if (a === 0) continue

          if (method === 'average') {
            // Weight by alpha so semi-transparent edges do not drag the
            // average towards whatever happens to sit in the RGB channels.
            r += data[i] * a
            g += data[i + 1] * a
            b += data[i + 2] * a
          } else {
            const key =
              ((data[i] >> shift) << (QUANT_BITS * 2)) |
              ((data[i + 1] >> shift) << QUANT_BITS) |
              (data[i + 2] >> shift)
            const acc = buckets.get(key)
            if (acc) {
              acc.n++; acc.r += data[i]; acc.g += data[i + 1]; acc.b += data[i + 2]
            } else {
              buckets.set(key, { n: 1, r: data[i], g: data[i + 1], b: data[i + 2] })
            }
          }
        }
      }

      const cell = cy * gridW + cx
      const meanA = n === 0 ? 0 : sumA / n
      if (meanA < ALPHA_THRESHOLD) {
        opaque[cell] = 0
        continue
      }
      opaque[cell] = 1

      if (method === 'average') {
        const w = sumA || 1
        colors[cell * 3] = r / w
        colors[cell * 3 + 1] = g / w
        colors[cell * 3 + 2] = b / w
      } else {
        // Dominant bucket wins, then average within it so the representative
        // colour is accurate rather than quantised to the bucket centre.
        let best: { n: number; r: number; g: number; b: number } | undefined
        for (const acc of buckets.values()) if (!best || acc.n > best.n) best = acc
        if (best) {
          colors[cell * 3] = best.r / best.n
          colors[cell * 3 + 1] = best.g / best.n
          colors[cell * 3 + 2] = best.b / best.n
        }
      }
    }
  }

  return { width: gridW, height: gridH, colors, opaque }
}
