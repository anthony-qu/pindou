import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EMPTY, type BeadChart } from '../lib/chart'
import { PALETTE } from '../lib/palette'
import { readableInkFor } from '../lib/color'

/** Screen pixels per cell at which bead codes become legible enough to draw. */
const CODE_VISIBLE_AT = 17
/** Below this, per-cell gridlines turn into visual noise, so they are dropped. */
const CELL_LINES_AT = 7

const MIN_SCALE = 0.5
const MAX_SCALE = 90

/** Empty cells are drawn as a checkerboard so they read as holes, not beads.
 *  The dark pair stays mid-grey rather than near-black so the gridlines, which
 *  are dark because they mostly cross beads, still read where they cross holes. */
const HOLES = {
  light: ['#eceff1', '#f7f9fa'],
  dark: ['#45454e', '#4d4d57'],
}
/** Fade applied to everything except the isolated colour. */
const SCRIM = {
  light: 'rgba(250, 247, 242, 0.82)',
  dark: 'rgba(16, 15, 19, 0.82)',
}
/** Chart outline, which sits against the surrounding background. */
const EDGE = {
  light: 'rgba(0,0,0,0.85)',
  dark: 'rgba(255,255,255,0.5)',
}

interface Props {
  chart: BeadChart
  /** Chart view draws gridlines and codes; preview shows the bare image. */
  showGrid: boolean
  /** Palette index to isolate, or null for the whole chart. */
  highlight: number | null
  dark: boolean
}

/** One tile of the transparent-cell checkerboard: 2x2 squares of 8px.
 *  Painted as a repeating pattern so the cost of the holes is one fill,
 *  independent of zoom. */
function useHoleTile(dark: boolean) {
  return useMemo(() => {
    const [a, b] = HOLES[dark ? 'dark' : 'light']
    const t = document.createElement('canvas')
    t.width = 16
    t.height = 16
    const g = t.getContext('2d')!
    g.fillStyle = b
    g.fillRect(0, 0, 16, 16)
    g.fillStyle = a
    g.fillRect(8, 0, 8, 8)
    g.fillRect(0, 8, 8, 8)
    return t
  }, [dark])
}

/** Renders the chart at 1px per cell once, then scales it up with smoothing
 *  off. Far cheaper than issuing thousands of fillRect calls every frame, and
 *  it keeps bead edges crisp at any zoom. */
function useChartBitmap(chart: BeadChart) {
  return useMemo(() => {
    const c = document.createElement('canvas')
    c.width = chart.width
    c.height = chart.height
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(chart.width, chart.height)
    for (let i = 0; i < chart.width * chart.height; i++) {
      const idx = chart.cells[i]
      if (idx === EMPTY) {
        img.data[i * 4 + 3] = 0
        continue
      }
      const { rgb } = PALETTE[idx]
      img.data[i * 4] = rgb.r
      img.data[i * 4 + 1] = rgb.g
      img.data[i * 4 + 2] = rgb.b
      img.data[i * 4 + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    return c
  }, [chart])
}

export default function ChartCanvas({ chart, showGrid, highlight, dark }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const bitmap = useChartBitmap(chart)
  const holeTile = useHoleTile(dark)

  const [view, setView] = useState({ scale: 1, ox: 0, oy: 0 })
  const [size, setSize] = useState({ w: 0, h: 0 })

  // Kept in a ref so the gesture handlers, bound once, always read the current
  // transform without being torn down and rebuilt on every pan.
  const viewRef = useRef(view)
  viewRef.current = view

  const fit = useCallback(() => {
    const w = wrapRef.current?.clientWidth ?? 0
    const h = wrapRef.current?.clientHeight ?? 0
    if (!w || !h) return
    const pad = 16
    const scale = Math.min((w - pad * 2) / chart.width, (h - pad * 2) / chart.height)
    setView({
      scale,
      ox: (w - chart.width * scale) / 2,
      oy: (h - chart.height * scale) / 2,
    })
  }, [chart])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  useEffect(fit, [fit, size.w, size.h])

  /** Zoom about a fixed screen point so the cell under the cursor stays put. */
  const zoomAt = useCallback((sx: number, sy: number, factor: number) => {
    setView((v) => {
      const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale * factor))
      const k = scale / v.scale
      return { scale, ox: sx - (sx - v.ox) * k, oy: sy - (sy - v.oy) * k }
    })
  }, [])

  // Wheel zoom. Registered manually because React's onWheel is passive and
  // therefore cannot preventDefault the browser's own page zoom.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  // Drag to pan, two-finger pinch to zoom.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    let g: { x: number; y: number; dist: number | null } | null = null

    const pointOf = (t: TouchList) => {
      const r = el.getBoundingClientRect()
      if (t.length >= 2) {
        return {
          x: (t[0].clientX + t[1].clientX) / 2 - r.left,
          y: (t[0].clientY + t[1].clientY) / 2 - r.top,
          dist: Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY),
        }
      }
      return { x: t[0].clientX - r.left, y: t[0].clientY - r.top, dist: null }
    }

    const onStart = (e: TouchEvent) => { g = pointOf(e.touches) }
    const onMove = (e: TouchEvent) => {
      if (!g) return
      e.preventDefault()
      const p = pointOf(e.touches)
      if (p.dist !== null && g.dist) zoomAt(p.x, p.y, p.dist / g.dist)
      setView((v) => ({ ...v, ox: v.ox + (p.x - g!.x), oy: v.oy + (p.y - g!.y) }))
      g = p
    }
    const onEnd = (e: TouchEvent) => { g = e.touches.length ? pointOf(e.touches) : null }

    el.addEventListener('touchstart', onStart, { passive: false })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [zoomAt])

  const onMouseDown = (e: React.MouseEvent) => {
    const startX = e.clientX, startY = e.clientY
    const base = { ...viewRef.current }
    const move = (m: MouseEvent) => {
      setView({ ...base, ox: base.ox + (m.clientX - startX), oy: base.oy + (m.clientY - startY) })
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  // Draw.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !size.w || !size.h) return
    const theme = dark ? 'dark' : 'light'
    const dpr = window.devicePixelRatio || 1
    const ctx = canvas.getContext('2d')!
    // Assigning width or height reallocates the backing store — several
    // megabytes — and resets the context, so only do it when the size actually
    // changed. Previously every pinch frame reallocated, which is what pushes a
    // phone into discarding the canvas.
    const wantW = Math.round(size.w * dpr)
    const wantH = Math.round(size.h * dpr)
    if (canvas.width !== wantW || canvas.height !== wantH) {
      canvas.width = wantW
      canvas.height = wantH
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)

    const { scale, ox, oy } = view
    const w = chart.width * scale
    const h = chart.height * scale

    // Empty cells must read as holes, not as white beads.
    //
    // Drawn as one patterned fill rather than a loop of 8px squares. The loop
    // covered the chart's whole on-screen extent, not just the visible part, so
    // its cost grew with the square of the zoom: 1,368,900 fillRect calls per
    // redraw at maximum zoom on a 104 grid, against 7,056 when fitted. A pinch
    // redraws on every touchmove, which saturated the main thread and left
    // phones discarding the canvas backing store — the reported black screen.
    ctx.save()
    ctx.translate(ox, oy)
    const holes = ctx.createPattern(holeTile, 'repeat')
    if (holes) {
      ctx.fillStyle = holes
      ctx.fillRect(0, 0, w, h)
    }
    ctx.restore()

    ctx.imageSmoothingEnabled = false
    ctx.drawImage(bitmap, ox, oy, w, h)

    // Only the cells actually on screen are worth touching.
    const c0 = Math.max(0, Math.floor((0 - ox) / scale))
    const c1 = Math.min(chart.width, Math.ceil((size.w - ox) / scale))
    const r0 = Math.max(0, Math.floor((0 - oy) / scale))
    const r1 = Math.min(chart.height, Math.ceil((size.h - oy) / scale))

    // Isolate one colour: fade everything, then repaint just that colour.
    if (highlight !== null) {
      ctx.fillStyle = SCRIM[theme]
      ctx.fillRect(ox, oy, w, h)
      ctx.fillStyle = PALETTE[highlight].hex
      for (let y = r0; y < r1; y++) {
        for (let x = c0; x < c1; x++) {
          if (chart.cells[y * chart.width + x] !== highlight) continue
          ctx.fillRect(ox + x * scale, oy + y * scale, scale + 0.5, scale + 0.5)
        }
      }

      // Outline the perimeter of each highlighted cluster only — the edges whose
      // neighbour is a different colour. Boxing every cell individually would
      // lay two lines side by side between adjacent highlighted cells, which
      // reads as heavy black. Gated at the same zoom as the other cell lines so
      // it disappears on zoom out instead of turning the chart into a black mess.
      if (scale >= CELL_LINES_AT) {
        const W = chart.width, H = chart.height
        ctx.strokeStyle = 'rgba(0,0,0,0.3)'
        ctx.lineWidth = 1
        ctx.beginPath()
        for (let y = r0; y < r1; y++) {
          for (let x = c0; x < c1; x++) {
            if (chart.cells[y * W + x] !== highlight) continue
            // Half-pixel offsets so hairlines land on a pixel, not across two.
            const x1 = Math.round(ox + x * scale) + 0.5
            const y1 = Math.round(oy + y * scale) + 0.5
            const x2 = Math.round(ox + (x + 1) * scale) + 0.5
            const y2 = Math.round(oy + (y + 1) * scale) + 0.5
            if (y === 0 || chart.cells[(y - 1) * W + x] !== highlight) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y1) }
            if (y === H - 1 || chart.cells[(y + 1) * W + x] !== highlight) { ctx.moveTo(x1, y2); ctx.lineTo(x2, y2) }
            if (x === 0 || chart.cells[y * W + x - 1] !== highlight) { ctx.moveTo(x1, y1); ctx.lineTo(x1, y2) }
            if (x === W - 1 || chart.cells[y * W + x + 1] !== highlight) { ctx.moveTo(x2, y1); ctx.lineTo(x2, y2) }
          }
        }
        ctx.stroke()
      }
    }

    if (!showGrid) return

    const line = (i: number, vertical: boolean, style: string, width: number, dash: number[]) => {
      ctx.strokeStyle = style
      ctx.lineWidth = width
      ctx.setLineDash(dash)
      ctx.beginPath()
      const p = Math.round(vertical ? ox + i * scale : oy + i * scale) + (width % 2 ? 0.5 : 0)
      if (vertical) { ctx.moveTo(p, oy); ctx.lineTo(p, oy + h) }
      else { ctx.moveTo(ox, p); ctx.lineTo(ox + w, p) }
      ctx.stroke()
    }

    // Gridlines stay dark in both themes: they mostly cross beads, whose colours
    // are arbitrary, and a light line would vanish on the many pale beads.
    for (const vertical of [true, false]) {
      const from = vertical ? c0 : r0
      const to = vertical ? c1 : r1
      if (scale >= CELL_LINES_AT) {
        for (let i = from; i <= to; i++) {
          if (i % 5 === 0) continue
          line(i, vertical, 'rgba(0,0,0,0.13)', 1, [])
        }
      }
      for (let i = from; i <= to; i++) {
        if (i % 5 !== 0 || i % 10 === 0) continue
        line(i, vertical, 'rgba(0,0,0,0.45)', 1, [4, 3])
      }
      for (let i = from; i <= to; i++) {
        if (i % 10 !== 0) continue
        line(i, vertical, 'rgba(0,0,0,0.75)', 2, [])
      }
    }
    ctx.setLineDash([])

    ctx.strokeStyle = EDGE[theme]
    ctx.lineWidth = 2
    ctx.strokeRect(ox, oy, w, h)

    if (scale < CODE_VISIBLE_AT) return

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `600 ${Math.round(scale * 0.34)}px ui-monospace, SFMono-Regular, Menlo, monospace`
    for (let y = r0; y < r1; y++) {
      for (let x = c0; x < c1; x++) {
        const idx = chart.cells[y * chart.width + x]
        if (idx === EMPTY) continue
        if (highlight !== null && idx !== highlight) continue
        const bead = PALETTE[idx]
        ctx.fillStyle = readableInkFor(bead.lab.L)
        ctx.fillText(bead.code, ox + (x + 0.5) * scale, oy + (y + 0.55) * scale)
      }
    }
  }, [chart, bitmap, view, size, showGrid, highlight, dark])

  return (
    <div ref={wrapRef} className="canvas-wrap" onMouseDown={onMouseDown}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <button className="fit-btn" onClick={fit} type="button" aria-label="Fit to view">⤢</button>
    </div>
  )
}
