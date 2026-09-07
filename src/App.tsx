import { useCallback, useEffect, useMemo, useState } from 'react'
import ChartCanvas from './components/ChartCanvas'
import BeadCounts from './components/BeadCounts'
import Uploader from './components/Uploader'
import { loadImageData } from './lib/loadImage'
import { CANVAS_SIZES, fitGrid, pixelate, type CanvasSize, type SampleMethod } from './lib/pixelate'
import { buildChart } from './lib/chart'
import { STRINGS, type Lang } from './i18n'

export default function App() {
  const [lang, setLang] = useState<Lang>(() =>
    navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en',
  )
  const t = STRINGS[lang]

  const [image, setImage] = useState<ImageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [canvasSize, setCanvasSize] = useState<CanvasSize>(78)
  const [method, setMethod] = useState<SampleMethod>('average')
  const [showGrid, setShowGrid] = useState(true)

  useEffect(() => { document.documentElement.lang = lang }, [lang])

  const onFile = useCallback(async (file: File) => {
    setError(null)
    try {
      setImage(await loadImageData(file))
    } catch {
      setImage(null)
      setError(STRINGS[lang].badImage)
    }
  }, [lang])

  // Stage A: the expensive downsample. Recomputed only when the image, the
  // canvas size or the sampling method changes.
  const grid = useMemo(() => {
    if (!image) return null
    const { width, height } = fitGrid(image.width, image.height, canvasSize)
    return pixelate(image, width, height, method)
  }, [image, canvasSize, method])

  // Stage B: cheap palette matching, kept separate so future palette
  // constraints can re-run it alone.
  const chart = useMemo(() => (grid ? buildChart(grid) : null), [grid])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">▩</span>
          <div>
            <h1>{t.title}</h1>
            <p>{t.tagline}</p>
          </div>
        </div>
        <div className="topbar-right">
          {image && (
            <button className="ghost" onClick={() => { setImage(null); setError(null) }}>
              {t.reset}
            </button>
          )}
          <div className="langswitch" role="group" aria-label="Language">
            <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
            <button className={lang === 'zh' ? 'on' : ''} onClick={() => setLang('zh')}>中文</button>
          </div>
        </div>
      </header>

      {!image || !chart ? (
        <main className="intro">
          <Uploader onFile={onFile} label={t.drop} hint={t.dropHint} error={error} />
          <p className="privacy">{t.privacy}</p>
        </main>
      ) : (
        <main className="workspace">
          <section className="stage">
            <div className="controls">
              <div className="ctrl">
                <label>{t.canvasSize}</label>
                <div className="seg">
                  {CANVAS_SIZES.map((s) => (
                    <button
                      key={s}
                      className={canvasSize === s ? 'on' : ''}
                      onClick={() => setCanvasSize(s)}
                    >
                      {s}×{s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ctrl">
                <label>{t.method}</label>
                <div className="seg">
                  <button
                    className={method === 'average' ? 'on' : ''}
                    onClick={() => setMethod('average')}
                    title={t.averageHint}
                  >
                    {t.average}
                  </button>
                  <button
                    className={method === 'sharp' ? 'on' : ''}
                    onClick={() => setMethod('sharp')}
                    title={t.sharpHint}
                  >
                    {t.sharp}
                  </button>
                </div>
              </div>

              <div className="ctrl">
                <label>{t.view}</label>
                <div className="seg">
                  <button className={!showGrid ? 'on' : ''} onClick={() => setShowGrid(false)}>
                    {t.viewPreview}
                  </button>
                  <button className={showGrid ? 'on' : ''} onClick={() => setShowGrid(true)}>
                    {t.viewChart}
                  </button>
                </div>
              </div>

              <dl className="stats">
                <div><dt>{t.gridSize}</dt><dd>{chart.width}×{chart.height}</dd></div>
                <div><dt>{t.coloursUsed}</dt><dd>{chart.counts.length}</dd></div>
                <div><dt>{t.totalBeads}</dt><dd>{chart.totalBeads.toLocaleString()}</dd></div>
              </dl>
            </div>

            <ChartCanvas chart={chart} showGrid={showGrid} />
            <p className="stage-hint">{showGrid ? t.chartHint : t.fitNote}</p>
          </section>

          <aside className="sidebar">
            <BeadCounts
              counts={chart.counts}
              total={chart.totalBeads}
              labels={{ beadList: t.beadList, code: t.code, count: t.count }}
            />
          </aside>
        </main>
      )}
    </div>
  )
}
