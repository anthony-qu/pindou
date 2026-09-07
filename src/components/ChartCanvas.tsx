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

interface Props {
  chart: BeadChart
  /** Chart view draws gridlines and codes; preview shows the bare image. */
  showGrid: boolean
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

export default function ChartCanvas({ chart, showGrid }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const bitmap = useChartBitmap(chart)

  const [view, setView] = useState({ scale: 1, ox: 0, oy: 0 })
  const [size, setSize] = useState({ w: 0, h: 0 })

  // Fit the whole chart in view whenever the chart or the container changes.
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
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight })
    })
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
  const gesture = useRef<{ x: number; y: number; dist: number | null } | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return

    const pointOf = (t: TouchList | React.TouchList) => {
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

    const onStart = (e: TouchEvent) => { gesture.current = pointOf(e.touches) }
    const onMove = (e: TouchEvent) => {
      if (!gesture.current) return
      e.preventDefault()
      const p = pointOf(e.touches)
      const prev = gesture.current
      if (p.dist !== null && prev.dist) {
        zoomAt(p.x, p.y, p.dist / prev.dist)
      }
      setView((v) => ({ ...v, ox: v.ox + (p.x - prev.x), oy: v.oy + (p.y - prev.y) }))
      gesture.current = p
    }
    const onEnd = (e: TouchEvent) => {
      gesture.current = e.touches.length > 0 ? pointOf(e.touches) : null
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
  }, [zoomAt])

  const onMouseDown = (e: React.MouseEvent) => {
    const startX = e.clientX, startY = e.clientY
    const base = { ...view }
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

    if (!showGrid) return

    // Only draw the cells actually on screen.
    const c0 = Math.max(0, Math.floor((0 - ox) / scale))
    const c1 = Math.min(chart.width, Math.ceil((size.w - ox) / scale))
    const r0 = Math.max(0, Math.floor((0 - oy) / scale))
    const r1 = Math.min(chart.height, Math.ceil((size.h - oy) / scale))

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

    // Outer border.
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'
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
        const bead = PALETTE[idx]
        ctx.fillStyle = readableInkFor(bead.lab.L)
        ctx.fillText(bead.code, ox + (x + 0.5) * scale, oy + (y + 0.55) * scale)
      }
    }
  }, [chart, bitmap, view, size, showGrid])

  return (
    <div ref={wrapRef} className="canvas-wrap" onMouseDown={onMouseDown}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <button className="fit-btn" onClick={fit} type="button" aria-label="Fit to view">⤢</button>
    </div>
  )
}
