import type { BeadCount } from '../lib/chart'

interface Props {
  counts: BeadCount[]
  total: number
  labels: { beadList: string; code: string; count: string }
}

export default function BeadCounts({ counts, total, labels }: Props) {
  return (
    <div className="counts">
      <div className="counts-head">
        <h2>{labels.beadList}</h2>
        <span className="counts-total">{counts.length} · {total.toLocaleString()}</span>
      </div>
      <ol className="counts-list">
        {counts.map(({ bead, count }) => (
          <li key={bead.code}>
            <span className="swatch" style={{ background: bead.hex }} aria-hidden="true" />
            <span className="cc-code">{bead.code}</span>
            <span className="cc-hex">{bead.hex}</span>
            <span className="cc-count">{count.toLocaleString()}</span>
            <span
              className="cc-bar"
              style={{ width: `${(count / counts[0].count) * 100}%` }}
              aria-hidden="true"
            />
          </li>
        ))}
      </ol>
    </div>
  )
}
