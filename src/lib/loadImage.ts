/** Decodes an image source into ImageData at a working resolution.
 *
 *  This is the one resampling step the browser performs rather than us, so its
 *  two settings matter: how far it reduces, and which filter it uses getting
 *  there. Anything it destroys here is destroyed before the downsampler runs.
 */

/** `off` is nearest-neighbour, which is the correct choice for pixel-art
 *  sources — any interpolation smears sprite edges irrecoverably. */
export type Smoothing = 'off' | 'low' | 'medium' | 'high'

export const DEFAULT_MAX_SOURCE = 1600
export const DEFAULT_SMOOTHING: Smoothing = 'low'

function toUrl(src: Blob | string): { url: string; revoke: boolean } {
  return typeof src === 'string'
    ? { url: src, revoke: false }
    : { url: URL.createObjectURL(src), revoke: true }
}

export async function decodeToImageData(
  src: Blob | string,
  maxSource: number = DEFAULT_MAX_SOURCE,
  smoothing: Smoothing = DEFAULT_SMOOTHING,
): Promise<ImageData> {
  const { url, revoke } = toUrl(src)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('decode failed'))
      el.src = url
    })

    const scale = Math.min(1, maxSource / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('no 2d context')
    ctx.imageSmoothingEnabled = smoothing !== 'off'
    if (smoothing !== 'off') ctx.imageSmoothingQuality = smoothing
    ctx.drawImage(img, 0, 0, w, h)
    return ctx.getImageData(0, 0, w, h)
  } finally {
    if (revoke) URL.revokeObjectURL(url)
  }
}
