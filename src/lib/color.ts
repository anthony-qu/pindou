/** Colour conversion and perceptual distance.
 *
 *  Bead matching must happen in a perceptual space. Nearest-neighbour in raw
 *  RGB picks visibly wrong beads for skin tones and greens, because equal RGB
 *  distances are nowhere near equal perceptual distances.
 */

export interface Lab { L: number; a: number; b: number }
export interface Rgb { r: number; g: number; b: number }

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase()
}

/** sRGB byte -> linear light. A lookup table because the decode sits in the
 *  innermost loop of the downsampler, once per channel per source pixel. */
export const SRGB_TO_LINEAR = new Float32Array(256)
for (let i = 0; i < 256; i++) {
  const v = i / 255
  SRGB_TO_LINEAR[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

/** Linear light (0-1) -> sRGB (0-255). */
export function linearToSrgb(v: number): number {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
  return c * 255
}

/** CIELAB -> sRGB (0-255), the inverse of rgbToLab. */
export function labToRgb(L: number, a: number, b: number): Rgb {
  const fy = (L + 16) / 116
  const fx = fy + a / 500
  const fz = fy - b / 200
  const inv = (t: number) => (t > 6 / 29 ? t * t * t : 3 * (6 / 29) * (6 / 29) * (t - 4 / 29))

  const X = 0.95047 * inv(fx)
  const Y = inv(fy)
  const Z = 1.08883 * inv(fz)

  return {
    r: linearToSrgb(3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z),
    g: linearToSrgb(-0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z),
    b: linearToSrgb(0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z),
  }
}

/** sRGB (0-255) -> CIELAB, D65 white point. */
export function rgbToLab(r: number, g: number, b: number): Lab {
  const lin = (v: number) => {
    v /= 255
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  const R = lin(r), G = lin(g), B = lin(b)

  // sRGB -> XYZ (D65)
  const x = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047
  const y = (R * 0.2126729 + G * 0.7151522 + B * 0.0721750) / 1.0
  const z = (R * 0.0193339 + G * 0.1191920 + B * 0.9503041) / 1.08883

  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29)
  const fx = f(x), fy = f(y), fz = f(z)

  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) }
}

/** Squared euclidean distance in Lab (CIE76). Cheap; used to shortlist candidates. */
export function deltaE76Sq(a: Lab, b: Lab): number {
  const dL = a.L - b.L, da = a.a - b.a, db = a.b - b.b
  return dL * dL + da * da + db * db
}

const DEG = Math.PI / 180
const POW25_7 = Math.pow(25, 7)

/** CIEDE2000 colour difference. The accurate metric, used for final ranking. */
export function ciede2000(s: Lab, t: Lab): number {
  const C1 = Math.hypot(s.a, s.b)
  const C2 = Math.hypot(t.a, t.b)
  const Cbar = (C1 + C2) / 2
  const Cbar7 = Math.pow(Cbar, 7)
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + POW25_7)))

  const a1p = (1 + G) * s.a
  const a2p = (1 + G) * t.a
  const C1p = Math.hypot(a1p, s.b)
  const C2p = Math.hypot(a2p, t.b)

  let h1p = Math.atan2(s.b, a1p); if (h1p < 0) h1p += 2 * Math.PI
  let h2p = Math.atan2(t.b, a2p); if (h2p < 0) h2p += 2 * Math.PI

  const dLp = t.L - s.L
  const dCp = C2p - C1p

  let dhp = 0
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p
    if (dhp > Math.PI) dhp -= 2 * Math.PI
    else if (dhp < -Math.PI) dhp += 2 * Math.PI
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp / 2)

  const Lbp = (s.L + t.L) / 2
  const Cbp = (C1p + C2p) / 2

  let hbp: number
  if (C1p * C2p === 0) {
    hbp = h1p + h2p
  } else if (Math.abs(h1p - h2p) <= Math.PI) {
    hbp = (h1p + h2p) / 2
  } else if (h1p + h2p < 2 * Math.PI) {
    hbp = (h1p + h2p + 2 * Math.PI) / 2
  } else {
    hbp = (h1p + h2p - 2 * Math.PI) / 2
  }

  const T =
    1 -
    0.17 * Math.cos(hbp - 30 * DEG) +
    0.24 * Math.cos(2 * hbp) +
    0.32 * Math.cos(3 * hbp + 6 * DEG) -
    0.20 * Math.cos(4 * hbp - 63 * DEG)

  const dTheta = 30 * DEG * Math.exp(-Math.pow((hbp / DEG - 275) / 25, 2))
  const Cbp7 = Math.pow(Cbp, 7)
  const Rc = 2 * Math.sqrt(Cbp7 / (Cbp7 + POW25_7))
  const Sl = 1 + (0.015 * Math.pow(Lbp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbp - 50, 2))
  const Sc = 1 + 0.045 * Cbp
  const Sh = 1 + 0.015 * Cbp * T
  const Rt = -Math.sin(2 * dTheta) * Rc

  const tl = dLp / Sl
  const tc = dCp / Sc
  const th = dHp / Sh
  return Math.sqrt(tl * tl + tc * tc + th * th + Rt * tc * th)
}

/** Pick black or white text for maximum legibility on a given cell colour. */
export function readableInkFor(L: number): string {
  return L > 60 ? '#111111' : '#FFFFFF'
}
