import { useEffect, useRef } from 'react'
import type { Strings } from '../i18n'
import { DEFAULT_ADVANCED, isDefault, type Advanced } from '../lib/settings'
import type { ColorSpace } from '../lib/pixelate'
import type { Smoothing } from '../lib/loadImage'

interface Props {
  value: Advanced
  onChange: (next: Advanced) => void
  onClose: () => void
  t: Strings
  /** Sharp-only settings are marked when the current method is Smooth. */
  sharpActive: boolean
}

function Row({
  label, hint, tag, children,
}: {
  label: string
  hint: string
  tag?: string
  children: React.ReactNode
}) {
  return (
    <div className="adv-row">
      <div className="adv-head">
        <h3>{label}</h3>
        {tag && <span className="adv-tag">{tag}</span>}
      </div>
      <p className="adv-hint">{hint}</p>
      <div className="adv-control">{children}</div>
    </div>
  )
}

export default function AdvancedPanel({ value, onChange, onClose, t, sharpActive }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const set = <K extends keyof Advanced>(k: K, v: Advanced[K]) => onChange({ ...value, [k]: v })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    ref.current?.focus({ preventScroll: true })
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const spaces: [ColorSpace, string][] = [
    ['srgb', t.spaceSrgb], ['linear', t.spaceLinear], ['lab', t.spaceLab],
  ]
  const smoothings: [Smoothing, string][] = [
    ['off', t.smoothingOff], ['low', t.smoothingLow],
    ['medium', t.smoothingMedium], ['high', t.smoothingHigh],
  ]
  const sharpTag = sharpActive ? undefined : t.sharpOnly

  return (
    <div
      className="adv-panel" role="dialog" aria-label={t.advancedTitle}
      tabIndex={-1} ref={ref}
    >
      <header className="adv-top">
        <div>
          <h2>{t.advancedTitle}</h2>
          <p>{t.advancedIntro}</p>
        </div>
        <button className="ghost" onClick={onClose}>{t.done}</button>
      </header>

      <div className="adv-body">
        {/* 1 */}
        <Row label={t.spaceLabel} hint={t.spaceHint}>
          <div className="seg">
            {spaces.map(([id, name]) => (
              <button key={id} className={value.space === id ? 'on' : ''} onClick={() => set('space', id)}>
                {name}
              </button>
            ))}
          </div>
        </Row>

        {/* 2 */}
        <Row label={t.binsLabel} hint={t.binsHint} tag={sharpTag}>
          <input
            type="range" min={3} max={6} step={1} value={value.quantBits}
            onChange={(e) => set('quantBits', Number(e.target.value))}
          />
          <span className="adv-value">
            {2 ** (8 - value.quantBits)} {t.binsUnit}
          </span>
        </Row>

        {/* 3 */}
        <Row label={t.dominanceLabel} hint={t.dominanceHint} tag={sharpTag}>
          <input
            type="range" min={0} max={0.9} step={0.05} value={value.dominance}
            onChange={(e) => set('dominance', Number(e.target.value))}
          />
          <span className="adv-value">
            {value.dominance === 0 ? t.dominanceOff : `${Math.round(value.dominance * 100)}%`}
          </span>
        </Row>

        {/* 4 */}
        <Row label={t.sourceLabel} hint={t.sourceHint}>
          <div className="seg">
            {smoothings.map(([id, name]) => (
              <button key={id} className={value.smoothing === id ? 'on' : ''} onClick={() => set('smoothing', id)}>
                {name}
              </button>
            ))}
          </div>
          <div className="adv-sub">
            <label>{t.maxSourceLabel}</label>
            <input
              type="range" min={200} max={2400} step={100} value={value.maxSource}
              onChange={(e) => set('maxSource', Number(e.target.value))}
            />
            <span className="adv-value">{value.maxSource}px</span>
          </div>
        </Row>

        {/* 5 */}
        <Row label={t.phaseLabel} hint={t.phaseHint}>
          <div className="adv-sub">
            <label>X</label>
            <input
              type="range" min={0} max={0.9} step={0.1} value={value.phaseX}
              onChange={(e) => set('phaseX', Number(e.target.value))}
            />
            <span className="adv-value">{value.phaseX.toFixed(1)}</span>
          </div>
          <div className="adv-sub">
            <label>Y</label>
            <input
              type="range" min={0} max={0.9} step={0.1} value={value.phaseY}
              onChange={(e) => set('phaseY', Number(e.target.value))}
            />
            <span className="adv-value">{value.phaseY.toFixed(1)}</span>
          </div>
        </Row>

        {/* 6 */}
        <Row label={t.alphaLabel} hint={t.alphaHint}>
          <input
            type="range" min={0.1} max={0.9} step={0.05} value={value.alphaThreshold}
            onChange={(e) => set('alphaThreshold', Number(e.target.value))}
          />
          <span className="adv-value">{Math.round(value.alphaThreshold * 100)}%</span>
        </Row>

        {/* 7 */}
        <Row label={t.saturationLabel} hint={t.saturationHint}>
          <input
            type="range" min={0.6} max={1.8} step={0.05} value={value.saturation}
            onChange={(e) => set('saturation', Number(e.target.value))}
          />
          <span className="adv-value">{value.saturation.toFixed(2)}×</span>
        </Row>
      </div>

      <footer className="adv-foot">
        <button
          className="ghost" onClick={() => onChange({ ...DEFAULT_ADVANCED })}
          disabled={isDefault(value)}
        >{t.resetDefaults}</button>
      </footer>
    </div>
  )
}
