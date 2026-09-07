import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ChartCanvas from './components/ChartCanvas'
import BeadCounts from './components/BeadCounts'
import Uploader from './components/Uploader'
import AdvancedPanel from './components/AdvancedPanel'
import { decodeToImageData } from './lib/loadImage'
import { loadAdvanced, saveAdvanced, isDefault } from './lib/settings'
import { CANVAS_SIZES, fitGrid, pixelate, type CanvasSize, type SampleMethod } from './lib/pixelate'
import { buildChart } from './lib/chart'
import { buildMergePlan, simplify } from './lib/simplify'
import {
  deleteProject, exportProjectFile, imageDataToUrl, importProjectFile, listProjects,
  newId, saveProject, StorageFullError, type SavedProject,
} from './lib/projects'
import { STRINGS, type Lang, type Strings } from './i18n'

/** Stray-bead cleanup is built and tested (see simplify.ts) but is not exposed
 *  in the UI yet, so it stays off. */
const MIN_ISLAND = 0

const THEME_KEY = 'pindou.theme'

export default function App() {
  const [lang, setLang] = useState<Lang>(() =>
    navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en',
  )
  const t: Strings = STRINGS[lang]

  const [dark, setDark] = useState<boolean>(() => {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'dark' || saved === 'light') return saved === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
  }, [dark])

  const [advanced, setAdvanced] = useState(() => loadAdvanced())
  const [advOpen, setAdvOpen] = useState(false)
  useEffect(() => { saveAdvanced(advanced) }, [advanced])

  /** The undecimated source, kept so the decode can be redone when the
   *  downscale policy changes. A Blob for a chosen file, a data URL for a
   *  reopened project. */
  const [source, setSource] = useState<Blob | string | null>(null)
  const [image, setImage] = useState<ImageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [canvasSize, setCanvasSize] = useState<CanvasSize>(78)
  const [method, setMethod] = useState<SampleMethod>('average')
  const [showGrid, setShowGrid] = useState(true)

  // Stored as a target colour count rather than a merge-step count: the step
  // count is meaningless once the underlying chart changes, the target is not.
  const [targetColours, setTargetColours] = useState<number | null>(null)
  const [highlight, setHighlight] = useState<number | null>(null)

  const [projects, setProjects] = useState<SavedProject[]>(() => listProjects())
  const [projectId, setProjectId] = useState<string | null>(null)
  const [projectName, setProjectName] = useState('')
  const [savedFlash, setSavedFlash] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => { document.documentElement.lang = lang }, [lang])

  /* ---------- pipeline ---------- */

  // Stage 0: the browser's own resize. Redone when its policy changes, since
  // whatever it discards is gone before the downsampler ever runs.
  useEffect(() => {
    if (!source) { setImage(null); return }
    let live = true
    decodeToImageData(source, advanced.maxSource, advanced.smoothing)
      .then((img) => { if (live) { setImage(img); setError(null) } })
      .catch(() => { if (live) { setImage(null); setError(STRINGS[lang].badImage) } })
    return () => { live = false }
  }, [source, advanced.maxSource, advanced.smoothing, lang])

  // Stage A: the expensive downsample. Recomputed only when the image, the
  // canvas size or the sampling method changes.
  const grid = useMemo(() => {
    if (!image) return null
    const { width, height } = fitGrid(image.width, image.height, canvasSize)
    return pixelate(image, width, height, method, {
      space: advanced.space,
      quantBits: advanced.quantBits,
      dominance: advanced.dominance,
      alphaThreshold: advanced.alphaThreshold,
      saturation: advanced.saturation,
      phaseX: advanced.phaseX,
      phaseY: advanced.phaseY,
    })
  }, [image, canvasSize, method, advanced])

  // Stage B: cheap palette matching.
  const base = useMemo(() => (grid ? buildChart(grid) : null), [grid])

  // The merge ordering. Computed once per chart; the slider is an index into it.
  const plan = useMemo(() => (base ? buildMergePlan(base.counts) : null), [base])

  const maxColours = plan?.initialCount ?? 1
  const target = Math.min(targetColours ?? maxColours, maxColours)

  // Stage C: simplification. Re-runs on every slider movement, in ~1ms.
  const chart = useMemo(() => {
    if (!base || !plan) return null
    return simplify(base, plan, Math.max(0, plan.initialCount - target), MIN_ISLAND)
  }, [base, plan, target])

  // A colour can vanish under the simplify slider while it is isolated.
  useEffect(() => {
    if (highlight === null || !chart) return
    if (!chart.counts.some((c) => c.bead.index === highlight)) setHighlight(null)
  }, [chart, highlight])

  /* ---------- files and projects ---------- */

  const openImage = useCallback((file: File) => {
    setError(null)
    setSource(file)
    setProjectId(null)
    setProjectName(file.name.replace(/\.[^.]+$/, '').slice(0, 40))
    setTargetColours(null)
    setHighlight(null)
  }, [])

  const applyProject = useCallback((p: SavedProject) => {
    setError(null)
    setSource(p.image)
    setCanvasSize(p.settings.canvasSize)
    setMethod(p.settings.method)
    setProjectId(p.id)
    setProjectName(p.name)
    setHighlight(null)
    setTargetColours(p.settings.mergeSteps > 0 ? p.settings.mergeSteps : null)
  }, [])

  const doSave = useCallback(() => {
    if (!image || !chart) return
    const id = projectId ?? newId()
    try {
      const list = saveProject({
        id,
        name: projectName.trim() || t.untitled,
        savedAt: Date.now(),
        image: imageDataToUrl(image),
        settings: { canvasSize, method, mergeSteps: target, minIsland: MIN_ISLAND },
      })
      setProjects(list)
      setProjectId(id)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1600)
    } catch (e) {
      setError(e instanceof StorageFullError ? t.storageFull : String(e))
    }
  }, [image, chart, projectId, projectName, canvasSize, method, target, t])

  const currentProject = useCallback((): SavedProject | null => {
    if (!image) return null
    return {
      id: projectId ?? newId(),
      name: projectName.trim() || t.untitled,
      savedAt: Date.now(),
      image: imageDataToUrl(image),
      settings: { canvasSize, method, mergeSteps: target, minIsland: MIN_ISLAND },
    }
  }, [image, projectId, projectName, canvasSize, method, target, t])

  /* ---------- render ---------- */

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
            <button className="ghost" onClick={() => { setSource(null); setError(null); setProjectId(null) }}>
              {t.reset}
            </button>
          )}
          <button
            className="ghost icon"
            onClick={() => setDark((d) => !d)}
            aria-label={dark ? t.lightMode : t.darkMode}
            title={dark ? t.lightMode : t.darkMode}
          >{dark ? '☀' : '☾'}</button>
          <div className="langswitch" role="group" aria-label="Language">
            <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
            <button className={lang === 'zh' ? 'on' : ''} onClick={() => setLang('zh')}>中文</button>
          </div>
        </div>
      </header>

      {!image || !chart || !plan ? (
        <main className="intro">
          <Uploader onFile={openImage} label={t.drop} hint={t.dropHint} error={error} />
          <p className="privacy">{t.privacy}</p>

          <div className="intro-projects">
            <div className="ip-head">
              <h2>{t.projects}</h2>
              <button className="ghost small" onClick={() => importRef.current?.click()}>
                {t.importFile}
              </button>
              <input
                ref={importRef} type="file" accept=".json,application/json" hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (!f) return
                  try {
                    const p = await importProjectFile(f)
                    setProjects(saveProject(p))
                    await applyProject(p)
                  } catch { setError(t.badImage) }
                }}
              />
            </div>
            {projects.length === 0 ? (
              <p className="muted">{t.noProjects}</p>
            ) : (
              <ul className="project-list">
                {projects.map((p) => (
                  <li key={p.id}>
                    <button className="pl-open" onClick={() => applyProject(p)}>
                      <img src={p.image} alt="" />
                      <span className="pl-name">{p.name}</span>
                      <span className="pl-meta">
                        {p.settings.canvasSize}×{p.settings.canvasSize} ·{' '}
                        {new Date(p.savedAt).toLocaleDateString()}
                      </span>
                    </button>
                    <button
                      className="pl-del" aria-label={t.remove}
                      onClick={() => setProjects(deleteProject(p.id))}
                    >×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </main>
      ) : (
        <main className="workspace">
          <section className="stage">
            <div className="controls">
              <div className="ctrl">
                <label>{t.canvasSize}</label>
                <div className="seg">
                  {CANVAS_SIZES.map((s) => (
                    <button key={s} className={canvasSize === s ? 'on' : ''} onClick={() => setCanvasSize(s)}>
                      {s}×{s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ctrl">
                <label>{t.method}</label>
                <div className="seg">
                  <button className={method === 'average' ? 'on' : ''} onClick={() => setMethod('average')} title={t.averageHint}>
                    {t.average}
                  </button>
                  <button className={method === 'sharp' ? 'on' : ''} onClick={() => setMethod('sharp')} title={t.sharpHint}>
                    {t.sharp}
                  </button>
                </div>
              </div>

              <div className="ctrl">
                <label>{t.view}</label>
                <div className="seg">
                  <button className={!showGrid ? 'on' : ''} onClick={() => setShowGrid(false)}>{t.viewPreview}</button>
                  <button className={showGrid ? 'on' : ''} onClick={() => setShowGrid(true)}>{t.viewChart}</button>
                </div>
              </div>

              <div className="ctrl grow">
                <label title={t.colourCountHint}>
                  {t.simplifyColours}
                  <span className="sub">{t.currentColours}: <b>{chart.counts.length}</b></span>
                </label>
                <input
                  type="range" min={1} max={maxColours} step={1} value={target}
                  onChange={(e) => setTargetColours(Number(e.target.value))}
                  aria-label={t.simplifyColours}
                />
              </div>

              <div className="ctrl">
                <label>&nbsp;</label>
                <button
                  className={`ghost adv-open${isDefault(advanced) ? '' : ' tweaked'}`}
                  onClick={() => setAdvOpen(true)}
                >
                  {t.advanced}{isDefault(advanced) ? '' : ' •'}
                </button>
              </div>

              <dl className="stats">
                <div><dt>{t.gridSize}</dt><dd>{chart.width}×{chart.height}</dd></div>
                <div><dt>{t.totalBeads}</dt><dd>{chart.totalBeads.toLocaleString()}</dd></div>
              </dl>
            </div>

            <div className="canvas-area">
              <ChartCanvas chart={chart} showGrid={showGrid} highlight={highlight} dark={dark} />
              {advOpen && (
                <AdvancedPanel
                  value={advanced}
                  onChange={setAdvanced}
                  onClose={() => setAdvOpen(false)}
                  t={t}
                  sharpActive={method === 'sharp'}
                />
              )}
            </div>

            <div className="stage-foot">
              <p className="stage-hint">
                {highlight !== null ? t.workHint : showGrid ? t.chartHint : t.fitNote}
              </p>
              <div className="saverow">
                <input
                  className="nameinput" value={projectName} placeholder={t.nameProject}
                  onChange={(e) => setProjectName(e.target.value)} aria-label={t.nameProject}
                />
                <button className="ghost" onClick={doSave}>{savedFlash ? `✓ ${t.saved}` : t.save}</button>
                <button className="ghost" onClick={() => { const p = currentProject(); if (p) exportProjectFile(p) }}>
                  {t.exportFile}
                </button>
              </div>
            </div>
            {error && <p className="drop-error">{error}</p>}
          </section>

          <aside className="sidebar">
            {highlight !== null && (
              <div className="workbar">
                <span className="wb-label">{t.placing}</span>
                <span className="swatch" style={{ background: chart.counts.find(c => c.bead.index === highlight)?.bead.hex }} />
                <b>{chart.counts.find((c) => c.bead.index === highlight)?.bead.code}</b>
                <span className="wb-progress">
                  {(chart.counts.find((c) => c.bead.index === highlight)?.count ?? 0).toLocaleString()}
                </span>
              </div>
            )}
            <BeadCounts
              counts={chart.counts}
              total={chart.totalBeads}
              t={t}
              highlight={highlight}
              onHighlight={setHighlight}
            />
            <p className="muted small">{t.savedInBrowser}</p>
          </aside>
        </main>
      )}
    </div>
  )
}
