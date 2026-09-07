import type { BeadCount } from '../lib/chart'
import type { Strings } from '../i18n'

interface Props {
  counts: BeadCount[]
  total: number
  t: Strings
  highlight: number | null
  onHighlight: (index: number | null) => void
  /** Beads already ticked off, per palette index. */
  progress: Map<number, number>
}

export default function BeadCounts({
  counts, total, t, highlight, onHighlight, progress,
}: Props) {
  const max = counts[0]?.count ?? 1
  return (
    <div className="counts">
      <div className="counts-head">
        <h2>{t.beadList}</h2>
        <span className="counts-total">{counts.length} · {total.toLocaleString()}</span>
      </div>

      {highlight !== null && (
        <button className="show-all" onClick={() => onHighlight(null)}>← {t.allColours}</button>
      )}

      <ol className="counts-list">
        {counts.map(({ bead, count }) => {
          const done = progress.get(bead.index) ?? 0
          const on = highlight === bead.index
          return (
            <li key={bead.code} className={on ? 'on' : ''}>
              <button
                onClick={() => onHighlight(on ? null : bead.index)}
                aria-pressed={on}
                title={t.workHint}
              >
                <span className="swatch" style={{ background: bead.hex }} aria-hidden="true" />
                <span className="cc-code">{bead.code}</span>
                <span className="cc-hex">{bead.hex}</span>
                <span className="cc-count">
                  {done > 0 && <em>{done.toLocaleString()}/</em>}
                  {count.toLocaleString()}
                </span>
              </button>
              <span className="cc-bar" style={{ width: `${(count / max) * 100}%` }} aria-hidden="true" />
              {done > 0 && (
                <span
                  className="cc-done"
                  style={{ width: `${(done / count) * (count / max) * 100}%` }}
                  aria-hidden="true"
                />
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
