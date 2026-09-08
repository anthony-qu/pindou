import { useEffect, useRef, useState } from 'react'
import ChartCanvas from './ChartCanvas'
import BeadCounts from './BeadCounts'
import type { BeadChart } from '../lib/chart'
import type { Strings } from '../i18n'

interface Props {
  chart: BeadChart
  dark: boolean
  onToggleTheme: () => void
  highlight: number | null
  onHighlight: (i: number | null) => void
  onExit: () => void
  t: Strings
}

/** Keeps the screen from sleeping while beading. Both hands are busy holding
 *  tweezers, so nothing is going to touch the screen for minutes at a time and
 *  the display would otherwise dim exactly when it is being read. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    type Sentinel = { release: () => Promise<void> }
    const wl = (navigator as unknown as {
      wakeLock?: { request: (t: 'screen') => Promise<Sentinel> }
    }).wakeLock
    if (!wl) return

    let lock: Sentinel | null = null
    let cancelled = false
    const acquire = () => {
      wl.request('screen')
        .then((l) => { if (cancelled) l.release().catch(() => {}); else lock = l })
        .catch(() => { /* denied or unsupported; not worth surfacing */ })
    }
    acquire()
    // The lock is dropped whenever the tab is backgrounded, so take it again.
    const onVisible = () => { if (document.visibilityState === 'visible') acquire() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release().catch(() => {})
    }
  }, [active])
}

export default function FocusMode({
  chart, dark, onToggleTheme, highlight, onHighlight, onExit, t,
}: Props) {
  const [layersOpen, setLayersOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useWakeLock(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Escape closes the layer list first, then leaves focus mode.
      if (layersOpen) setLayersOpen(false)
      else onExit()
    }
    window.addEventListener('keydown', onKey)
    ref.current?.focus({ preventScroll: true })
    return () => window.removeEventListener('keydown', onKey)
  }, [layersOpen, onExit])

  const active = highlight !== null ? chart.counts.find((c) => c.bead.index === highlight) : undefined

  return (
    <div className="focus" ref={ref} tabIndex={-1}>
      <ChartCanvas chart={chart} showGrid highlight={highlight} dark={dark} />

      <div className="focus-bar">
        <button className="fb" onClick={onExit} title={t.exitFocus} aria-label={t.exitFocus}>✕</button>
        <button
          className="fb" onClick={onToggleTheme}
          title={dark ? t.lightMode : t.darkMode} aria-label={dark ? t.lightMode : t.darkMode}
        >{dark ? '☀' : '☾'}</button>
        <button
          className={`fb wide${layersOpen ? ' on' : ''}`}
          onClick={() => setLayersOpen((v) => !v)}
          aria-expanded={layersOpen}
        >
          <span className="fb-stack" aria-hidden="true">▤</span>
          {active ? (
            <>
              <span className="fb-swatch" style={{ background: active.bead.hex }} />
              <b>{active.bead.code}</b>
              <span className="fb-count">{active.count.toLocaleString()}</span>
            </>
          ) : (
            <span>{t.layers}</span>
          )}
        </button>
        {highlight !== null && (
          <button className="fb" onClick={() => onHighlight(null)} title={t.allColours} aria-label={t.allColours}>
            ⦻
          </button>
        )}
      </div>

      {layersOpen && (
        <aside className="focus-layers">
          <BeadCounts
            counts={chart.counts}
            total={chart.totalBeads}
            t={t}
            highlight={highlight}
            onHighlight={(i) => { onHighlight(i); if (i !== null) setLayersOpen(false) }}
          />
        </aside>
      )}
    </div>
  )
}
