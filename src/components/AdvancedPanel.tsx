import { useEffect, useRef } from 'react'
import type { Strings } from '../i18n'
import { DEFAULT_ADVANCED, isDefault, type Advanced } from '../lib/settings'
import type { Refine } from '../lib/pixelate'
import type { Boundary, Kernel } from '../lib/kernel'

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

  const kernels: [Kernel, string][] = [
    ['box', t.kernelBox], ['tent', t.kernelTent], ['gaussian', t.kernelGaussian],
    ['mitchell', t.kernelMitchell], ['lanczos', t.kernelLanczos],
  ]
  const boundaries: [Boundary, string][] = [['snap', t.boundarySnap], ['exact', t.boundaryExact]]
  const refines: [Refine, string][] = [['mean', t.refineMean], ['centre', t.refineCentre]]
  const sharpTag = sharpActive ? undefined : t.sharpOnly

  return (
    <div className="adv-panel" role="dialog" aria-label={t.advancedTitle} tabIndex={-1} ref={ref}>
      <header className="adv-top">
        <div>
          <h2>{t.advancedTitle}</h2>
          <p>{t.advancedIntro}</p>
        </div>
        <button className="ghost" onClick={onClose}>{t.done}</button>
      </header>

      {/* Ordered as the pipeline applies them: gather, then the hole decision,
          then the binning that only Sharp uses. */}
      <div className="adv-body">
        <Row label={t.kernelLabel} hint={t.kernelHint}>
          <div className="seg wrap">
            {kernels.map(([id, name]) => (
              <button key={id} className={value.kernel === id ? 'on' : ''} onClick={() => set('kernel', id)}>
                {name}
              </button>
            ))}
          </div>
        </Row>

        <Row label={t.boundaryLabel} hint={t.boundaryHint}>
          <div className="seg">
            {boundaries.map(([id, name]) => (
              <button key={id} className={value.boundary === id ? 'on' : ''} onClick={() => set('boundary', id)}>
                {name}
              </button>
            ))}
          </div>
        </Row>

        <Row label={t.alphaLabel} hint={t.alphaHint}>
          <input
            type="range" min={0.1} max={0.9} step={0.05} value={value.alphaThreshold}
            onChange={(e) => set('alphaThreshold', Number(e.target.value))}
          />
          <span className="adv-value">{Math.round(value.alphaThreshold * 100)}%</span>
        </Row>

        <Row label={t.binsLabel} hint={t.binsHint} tag={sharpTag}>
          <input
            type="range" min={3} max={6} step={1} value={value.quantBits}
            onChange={(e) => set('quantBits', Number(e.target.value))}
          />
          <span className="adv-value">{2 ** (8 - value.quantBits)} {t.binsUnit}</span>
        </Row>

        <Row label={t.mergeLabel} hint={t.mergeHint} tag={sharpTag}>
          <input
            type="range" min={0} max={3} step={1} value={value.binMerge}
            onChange={(e) => set('binMerge', Number(e.target.value))}
          />
          <span className="adv-value">
            {value.binMerge === 0 ? t.mergeOff : `±${value.binMerge} ${t.mergeUnit}`}
          </span>
        </Row>

        <Row label={t.dominanceLabel} hint={t.dominanceHint} tag={sharpTag}>
          <input
            type="range" min={0} max={0.9} step={0.05} value={value.dominance}
            onChange={(e) => set('dominance', Number(e.target.value))}
          />
          <span className="adv-value">
            {value.dominance === 0 ? t.dominanceOff : `${Math.round(value.dominance * 100)}%`}
          </span>
        </Row>

        <Row label={t.refineLabel} hint={t.refineHint} tag={sharpTag}>
          <div className="seg">
            {refines.map(([id, name]) => (
              <button key={id} className={value.refine === id ? 'on' : ''} onClick={() => set('refine', id)}>
                {name}
              </button>
            ))}
          </div>
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
