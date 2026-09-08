/** Renders a chart to a high-resolution PNG: every cell filled with its bead
 *  colour and labelled with its code, plus counting gridlines, edge rulers and
 *  a legend. Self-contained, so it prints or shares without the app.
 *
 *  Always drawn on white regardless of the app's theme — this is a document,
 *  and a dark chart is unusable on paper and wasteful of ink.
 */

import { EMPTY, type BeadChart } from './chart'
import { PALETTE } from './palette'
import { readableInkFor } from './color'

/** Target for the longest edge of the grid itself, in pixels. */
const TARGET_EDGE = 4600
const MIN_CELL = 26
const MAX_CELL = 72

const INK = '#111111'
const INK_SOFT = '#6d635a'
const HOLE = '#ffffff'

export interface PngLabels {
  colours: string
  beads: string
}

function cellSizeFor(chart: BeadChart): number {
  const raw = Math.round(TARGET_EDGE / Math.max(chart.width, chart.height))
  return Math.max(MIN_CELL, Math.min(MAX_CELL, raw))
}

export function chartToPngBlob(
  chart: BeadChart,
  title: string,
  labels: PngLabels,
): Promise<Blob> {
  const cell = cellSizeFor(chart)
  const margin = Math.round(cell * 1.2)
  const ruler = Math.round(cell * 1.15)        // space for the edge numbers
  const header = Math.round(cell * 2.6)

  const gridW = chart.width * cell
  const gridH = chart.height * cell

  // Legend: swatch, code and count per entry, laid out in as many columns as
  // fit. The column width is measured from the widest code and the widest
  // count actually present — a fixed guess clips five-digit counts under the
  // next entry's swatch.
  const measure = document.createElement('canvas').getContext('2d')!
  const swatch = Math.round(cell * 0.72)
  const gap = Math.round(cell * 0.28)
  measure.font = `700 ${Math.round(cell * 0.46)}px ui-monospace, SFMono-Regular, Menlo, monospace`
  const codeW = Math.max(...chart.counts.map((c) => measure.measureText(c.bead.code).width))
  measure.font = `500 ${Math.round(cell * 0.42)}px ui-monospace, SFMono-Regular, Menlo, monospace`
  const countW = Math.max(...chart.counts.map((c) => measure.measureText(`×${c.count.toLocaleString()}`).width))
  const entryW = Math.ceil(swatch + gap + codeW + gap + countW + cell * 0.6)
  const entryH = Math.round(cell * 1.05)
  const contentW = ruler + gridW
  const legendCols = Math.max(1, Math.floor(contentW / entryW))
  const legendRows = Math.ceil(chart.counts.length / legendCols)
  const legendH = legendRows * entryH + Math.round(cell * 1.2)

  const W = margin * 2 + contentW
  const H = margin * 2 + header + ruler + gridH + legendH

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  const font = (px: number, weight = '600') =>
    `${weight} ${Math.round(px)}px ui-monospace, SFMono-Regular, Menlo, monospace`
  const sans = (px: number, weight = '700') =>
    `${weight} ${Math.round(px)}px -apple-system, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`

  /* ---------- header ---------- */
  ctx.fillStyle = INK
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = sans(cell * 1.15)
  ctx.fillText(title, margin, margin + cell * 1.15)
  ctx.fillStyle = INK_SOFT
  ctx.font = sans(cell * 0.62, '600')
  ctx.fillText(
    `${chart.width} × ${chart.height}   ·   ${chart.counts.length} ${labels.colours}   ·   ${chart.totalBeads.toLocaleString()} ${labels.beads}`,
    margin, margin + cell * 2.15,
  )

  const ox = margin + ruler
  const oy = margin + header + ruler

  /* ---------- cells ---------- */
  for (let y = 0; y < chart.height; y++) {
    for (let x = 0; x < chart.width; x++) {
      const idx = chart.cells[y * chart.width + x]
      const px = ox + x * cell
      const py = oy + y * cell
      if (idx === EMPTY) {
        ctx.fillStyle = HOLE
        ctx.fillRect(px, py, cell, cell)
        continue
      }
      ctx.fillStyle = PALETTE[idx].hex
      ctx.fillRect(px, py, cell, cell)
    }
  }

  /* ---------- codes ---------- */
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = font(cell * 0.36)
  for (let y = 0; y < chart.height; y++) {
    for (let x = 0; x < chart.width; x++) {
      const idx = chart.cells[y * chart.width + x]
      if (idx === EMPTY) continue
      const bead = PALETTE[idx]
      ctx.fillStyle = readableInkFor(bead.lab.L)
      ctx.fillText(bead.code, ox + (x + 0.5) * cell, oy + (y + 0.56) * cell)
    }
  }

  /* ---------- gridlines: every cell, dashed at 5, solid at 10 ---------- */
  const line = (i: number, vertical: boolean, style: string, width: number, dash: number[]) => {
    ctx.strokeStyle = style
    ctx.lineWidth = width
    ctx.setLineDash(dash)
    ctx.beginPath()
    const p = (vertical ? ox + i * cell : oy + i * cell) + (width % 2 ? 0.5 : 0)
    if (vertical) { ctx.moveTo(p, oy); ctx.lineTo(p, oy + gridH) }
    else { ctx.moveTo(ox, p); ctx.lineTo(ox + gridW, p) }
    ctx.stroke()
  }
  for (const vertical of [true, false]) {
    const n = vertical ? chart.width : chart.height
    for (let i = 0; i <= n; i++) {
      if (i % 5 === 0) continue
      line(i, vertical, 'rgba(0,0,0,0.16)', 1, [])
    }
    for (let i = 0; i <= n; i++) {
      if (i % 5 !== 0 || i % 10 === 0) continue
      line(i, vertical, 'rgba(0,0,0,0.45)', Math.max(1, Math.round(cell * 0.04)), [cell * 0.22, cell * 0.16])
    }
    for (let i = 0; i <= n; i++) {
      if (i % 10 !== 0) continue
      line(i, vertical, 'rgba(0,0,0,0.8)', Math.max(2, Math.round(cell * 0.07)), [])
    }
  }
  ctx.setLineDash([])
  ctx.strokeStyle = INK
  ctx.lineWidth = Math.max(2, Math.round(cell * 0.08))
  ctx.strokeRect(ox, oy, gridW, gridH)

  /* ---------- edge rulers, so you can find your place ---------- */
  ctx.fillStyle = INK_SOFT
  ctx.font = sans(cell * 0.5, '700')
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  for (let x = 10; x <= chart.width; x += 10) {
    ctx.fillText(String(x), ox + (x - 0.5) * cell, oy - cell * 0.28)
  }
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (let y = 10; y <= chart.height; y += 10) {
    ctx.fillText(String(y), ox - cell * 0.28, oy + (y - 0.5) * cell)
  }

  /* ---------- legend ---------- */
  const ly = oy + gridH + Math.round(cell * 1.1)
  ctx.textBaseline = 'middle'
  chart.counts.forEach(({ bead, count }, i) => {
    const col = i % legendCols
    const row = (i / legendCols) | 0
    const x = margin + col * entryW
    const y = ly + row * entryH + entryH / 2

    ctx.fillStyle = bead.hex
    ctx.fillRect(x, y - swatch / 2, swatch, swatch)
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'
    ctx.lineWidth = 1
    ctx.strokeRect(x + 0.5, y - swatch / 2 + 0.5, swatch - 1, swatch - 1)

    ctx.textAlign = 'left'
    ctx.fillStyle = INK
    ctx.font = font(cell * 0.46, '700')
    ctx.fillText(bead.code, x + swatch + gap, y)
    ctx.fillStyle = INK_SOFT
    ctx.font = font(cell * 0.42, '500')
    ctx.fillText(`×${count.toLocaleString()}`, x + swatch + gap + codeW + gap, y)
  })

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png')
  })
}

export async function downloadChartPng(
  chart: BeadChart,
  name: string,
  labels: PngLabels,
): Promise<void> {
  const blob = await chartToPngBlob(chart, name, labels)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(name || 'pindou').replace(/[^\w一-龥-]+/g, '_')}-${chart.width}x${chart.height}.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
