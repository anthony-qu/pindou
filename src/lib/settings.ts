/** Advanced conversion settings, ordered as the pipeline applies them.
 *
 *  Stored per browser rather than per project — they are tuning preferences,
 *  not content. The defaults reproduce the app's standard conversion exactly,
 *  so "Reset" always returns to a known-good baseline.
 *
 *  Five further parameters exist in the library at their defaults but are not
 *  exposed: averaging colour space, source downscale filter and working size,
 *  saturation boost, and grid phase. They stay covered by scripts/paramtest.ts,
 *  so re-exposing any of them is a control, not a rewrite.
 */

import { DEFAULT_PIXELATE, type Refine } from './pixelate'
import type { Boundary, Kernel } from './kernel'

export interface Advanced {
  /** 1. How source pixels inside a cell are weighted. */
  kernel: Kernel
  /** 2. Whether partially covered edge pixels are weighted by their coverage. */
  boundary: Boundary
  /** 3. Coverage a cell needs before it gets a bead. */
  alphaThreshold: number
  /** 4. Histogram bin width, as bits per channel. Sharp only. */
  quantBits: number
  /** 5. Radius, in bins, over which bins are pooled before the winner is
   *     chosen. Sharp only. */
  binMerge: number
  /** 6. Coverage the winner needs before Sharp trusts it. Sharp only. */
  dominance: number
  /** 7. Representative colour of the winning bin. Sharp only. */
  refine: Refine
}

export const DEFAULT_ADVANCED: Advanced = {
  kernel: DEFAULT_PIXELATE.kernel,
  boundary: DEFAULT_PIXELATE.boundary,
  alphaThreshold: DEFAULT_PIXELATE.alphaThreshold,
  quantBits: DEFAULT_PIXELATE.quantBits,
  binMerge: DEFAULT_PIXELATE.binMerge,
  dominance: DEFAULT_PIXELATE.dominance,
  refine: DEFAULT_PIXELATE.refine,
}

const KEY = 'pindou.advanced.v2'

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
