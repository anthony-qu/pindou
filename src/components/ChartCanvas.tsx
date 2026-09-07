import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EMPTY, type BeadChart } from '../lib/chart'
import { PALETTE } from '../lib/palette'
import { readableInkFor } from '../lib/color'

/** Screen pixels per cell at which bead codes become legible enough to draw. */
const CODE_VISIBLE_AT = 17
/** Below this, per-cell gridlines turn into visual noise, so they are dropped. */
const CELL_LINES_AT = 7
/** Below this, a placed-bead tick is too small to read. */
const TICK_VISIBLE_AT = 6

const MIN_SCALE = 0.5
const MAX_SCALE = 90
/** Pointer travel below which a gesture counts as a tap, not a drag. */
const TAP_SLOP = 5

interface Props {
  chart: BeadChart
  /** Chart view draws gridlines and codes; preview shows the bare image. */
  showGrid: boolean
  /** Palette index to isolate, or null for the whole chart. */
  highlight: number | null
  /** One byte per cell: which beads have been placed. */
  placed: Uint8Array | null
  onTogglePlaced?: (cell: number) => void
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

export default function ChartCanvas({
  chart, showGrid, highlight, placed, onTogglePlaced,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const bitmap = useChartBitmap(chart)

  const [view, setView] = useState({ scale: 1, ox: 0, oy: 0 })
  const [size, setSize] = useState({ w: 0, h: 0 })

  // Kept in a ref so the gesture handlers, which are bound once, always read
  // the current transform without being torn down and rebuilt on every pan.
  const viewRef = useRef(view)
  viewRef.current = view

  const tapRef = useRef<{ cell: number; onToggle?: (c: number) => void }>({ cell: -1 })
  tapRef.current.onToggle = onTogglePlaced

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

  /** Screen point -> cell index, or -1 outside the chart. */
  const cellAt = useCallback((sx: number, sy: number) => {
    const { scale, ox, oy } = viewRef.current
    const x = Math.floor((sx - ox) / scale)
    const y = Math.floor((sy - oy) / scale)
    if (x < 0 || y < 0 || x >= chart.width || y >= chart.height) return -1
    return y * chart.width + x
  }, [chart.width, chart.height])

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

  // Drag to pan, two-finger pinch to zoom, tap to tick a bead off.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    let g: { x: number; y: number; dist: number | null } | null = null
    let travel = 0
    let startCell = -1

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

    const onStart = (e: TouchEvent) => {
      g = pointOf(e.touches)
      travel = 0
      startCell = e.touches.length === 1 ? cellAt(g.x, g.y) : -1
    }
    const onMove = (e: TouchEvent) => {
      if (!g) return
      e.preventDefault()
      const p = pointOf(e.touches)
      travel += Math.hypot(p.x - g.x, p.y - g.y)
      if (p.dist !== null && g.dist) zoomAt(p.x, p.y, p.dist / g.dist)
      setView((v) => ({ ...v, ox: v.ox + (p.x - g!.x), oy: v.oy + (p.y - g!.y) }))
      g = p
    }
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        if (travel < TAP_SLOP && startCell >= 0) tapRef.current.onToggle?.(startCell)
        g = null
      } else {
        g = pointOf(e.touches)
      }
      startCell = -1
    }

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
  }, [zoomAt, cellAt])

  const onMouseDown = (e: React.MouseEvent) => {
    const el = wrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const startX = e.clientX, startY = e.clientY
    const cell = cellAt(startX - r.left, startY - r.top)
    const base = { ...viewRef.current }

    const move = (m: MouseEvent) => {
      setView({ ...base, ox: base.ox + (m.clientX - startX), oy: base.oy + (m.clientY - startY) })
    }
    const up = (m: MouseEvent) => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      if (Math.hypot(m.clientX - startX, m.clientY - startY) < TAP_SLOP && cell >= 0) {
        tapRef.current.onToggle?.(cell)
      }
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  // Draw.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !size.w || !size.h) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = size.w * dpr
    canvas.height = size.h * dpr
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)

    const { scale, ox, oy } = view
    const w = chart.width * scale
    const h = chart.height * scale

    // Empty cells must read as holes, not as white beads.
    ctx.save()
    ctx.beginPath()
    ctx.rect(ox, oy, w, h)
    ctx.clip()
    const sq = 8
    for (let y = 0; y < Math.ceil(h / sq); y++) {
      for (let x = 0; x < Math.ceil(w / sq); x++) {
        ctx.fillStyle = (x + y) % 2 ? '#eceff1' : '#f7f9fa'
        ctx.fillRect(ox + x * sq, oy + y * sq, sq, sq)
      }
    }
    ctx.restore()

    ctx.imageSmoothingEnabled = false
    ctx.drawImage(bitmap, ox, oy, w, h)

    // Only the cells actually on screen are worth touching.
    const c0 = Math.max(0, Math.floor((0 - ox) / scale))
    const c1 = Math.min(chart.width, Math.ceil((size.w - ox) / scale))
    const r0 = Math.max(0, Math.floor((0 - oy) / scale))
    const r1 = Math.min(chart.height, Math.ceil((size.h - oy) / scale))

    // Work mode: fade everything, then repaint just the colour being placed.
    if (highlight !== null) {
      ctx.fillStyle = 'rgba(250, 247, 242, 0.82)'
      ctx.fillRect(ox, oy, w, h)
      const bead = PALETTE[highlight]
      ctx.fillStyle = bead.hex
      for (let y = r0; y < r1; y++) {
        for (let x = c0; x < c1; x++) {
          if (chart.cells[y * chart.width + x] !== highlight) continue
          ctx.fillRect(ox + x * scale, oy + y * scale, scale + 0.5, scale + 0.5)
        }
      }
      if (scale >= 4) {
        ctx.strokeStyle = 'rgba(0,0,0,0.7)'
        ctx.lineWidth = 1
        for (let y = r0; y < r1; y++) {
          for (let x = c0; x < c1; x++) {
            if (chart.cells[y * chart.width + x] !== highlight) continue
            ctx.strokeRect(ox + x * scale + 0.5, oy + y * scale + 0.5, scale - 1, scale - 1)
          }
        }
      }
    }

    // Placed beads get a tick so you can see how far you have got.
    if (placed && scale >= TICK_VISIBLE_AT) {
      ctx.lineWidth = Math.max(1.4, scale * 0.11)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      for (let y = r0; y < r1; y++) {
        for (let x = c0; x < c1; x++) {
          const cell = y * chart.width + x
          const idx = chart.cells[cell]
          if (idx === EMPTY || !placed[cell]) continue
          if (highlight !== null && idx !== highlight) continue
          const cx = ox + x * scale, cy = oy + y * scale
          ctx.strokeStyle = readableInkFor(PALETTE[idx].lab.L)
          ctx.beginPath()
          ctx.moveTo(cx + scale * 0.24, cy + scale * 0.52)
          ctx.lineTo(cx + scale * 0.43, cy + scale * 0.72)
          ctx.lineTo(cx + scale * 0.77, cy + scale * 0.28)
          ctx.stroke()
        }
      }
    }

    if (!showGrid) return

    const line = (i: number, vertical: boolean, style: string, width: number, dash: number[]) => {
      ctx.strokeStyle = style
      ctx.lineWidth = width
      ctx.setLineDash(dash)
      ctx.beginPath()
      // Half-pixel offset so hairlines land on a pixel instead of straddling two.
      const p = Math.round(vertical ? ox + i * scale : oy + i * scale) + (width % 2 ? 0.5 : 0)
      if (vertical) { ctx.moveTo(p, oy); ctx.lineTo(p, oy + h) }
      else { ctx.moveTo(ox, p); ctx.lineTo(ox + w, p) }
      ctx.stroke()
    }

    // Faint per-cell lines, then dashed every 5, then solid every 10 on top.
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

    ctx.strokeStyle = 'rgba(0,0,0,0.85)'
    ctx.lineWidth = 2
    ctx.strokeRect(ox, oy, w, h)

    if (scale < CODE_VISIBLE_AT) return

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `600 ${Math.round(scale * 0.34)}px ui-monospace, SFMono-Regular, Menlo, monospace`
    for (let y = r0; y < r1; y++) {
      for (let x = c0; x < c1; x++) {
        const cell = y * chart.width + x
        const idx = chart.cells[cell]
        if (idx === EMPTY) continue
        if (highlight !== null && idx !== highlight) continue
        // A placed bead shows its tick instead of its code: drawing both in one
        // cell leaves neither readable, and once it is placed the code is spent.
        if (placed && placed[cell] && scale >= TICK_VISIBLE_AT) continue
        const bead = PALETTE[idx]
        ctx.fillStyle = readableInkFor(bead.lab.L)
        ctx.fillText(bead.code, ox + (x + 0.5) * scale, oy + (y + 0.55) * scale)
      }
    }
  }, [chart, bitmap, view, size, showGrid, highlight, placed])

  return (
    <div ref={wrapRef} className="canvas-wrap" onMouseDown={onMouseDown}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <button className="fit-btn" onClick={fit} type="button" aria-label="Fit to view">⤢</button>
    </div>
  )
}
