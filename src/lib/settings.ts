/** Advanced conversion settings: the seven knobs that visibly change output.
 *
 *  Stored per browser rather than per project — they are tuning preferences,
 *  not content. The defaults reproduce the app's original behaviour exactly,
 *  so "Reset" always returns to a known-good baseline.
 */

import { DEFAULT_MAX_SOURCE, DEFAULT_SMOOTHING, type Smoothing } from './loadImage'
import { DEFAULT_PIXELATE, type ColorSpace } from './pixelate'

export interface Advanced {
  /** 1. Space the cell average is computed in. */
  space: ColorSpace
  /** 2. Sharp's histogram bin width, as bits per channel. */
  quantBits: number
  /** 3. Coverage the dominant bucket needs before Sharp trusts it. */
  dominance: number
  /** 4. Source downscale policy. */
  smoothing: Smoothing
  maxSource: number
  /** 5. Grid origin offset, in cells. */
  phaseX: number
  phaseY: number
  /** 6. Coverage a cell needs to get a bead. */
  alphaThreshold: number
  /** 7. Saturation applied before reduction. */
  saturation: number
}

export const DEFAULT_ADVANCED: Advanced = {
  space: DEFAULT_PIXELATE.space,
  quantBits: DEFAULT_PIXELATE.quantBits,
  dominance: DEFAULT_PIXELATE.dominance,
  smoothing: DEFAULT_SMOOTHING,
  maxSource: DEFAULT_MAX_SOURCE,
  phaseX: DEFAULT_PIXELATE.phaseX,
  phaseY: DEFAULT_PIXELATE.phaseY,
  alphaThreshold: DEFAULT_PIXELATE.alphaThreshold,
  saturation: DEFAULT_PIXELATE.saturation,
}

const KEY = 'pindou.advanced.v1'

export function loadAdvanced(): Advanced {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_ADVANCED }
    // Merged over the defaults so a stored blob from an older build, or one
    // missing a key, still yields a complete and valid settings object.
    return { ...DEFAULT_ADVANCED, ...(JSON.parse(raw) as Partial<Advanced>) }
  } catch {
    return { ...DEFAULT_ADVANCED }
  }
}

export function saveAdvanced(a: Advanced) {
  try {
    localStorage.setItem(KEY, JSON.stringify(a))
  } catch {
    /* a full quota must not break conversion */
  }
}

export function isDefault(a: Advanced): boolean {
  return (Object.keys(DEFAULT_ADVANCED) as (keyof Advanced)[])
    .every((k) => a[k] === DEFAULT_ADVANCED[k])
}
