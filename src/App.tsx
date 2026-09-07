import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ChartCanvas from './components/ChartCanvas'
import BeadCounts from './components/BeadCounts'
import Uploader from './components/Uploader'
import { loadImageData } from './lib/loadImage'
import { CANVAS_SIZES, fitGrid, pixelate, type CanvasSize, type SampleMethod } from './lib/pixelate'
import { buildChart, EMPTY } from './lib/chart'
import { buildMergePlan, simplify } from './lib/simplify'
import {
  deleteProject, encodePlaced, decodePlaced, exportProjectFile, imageDataToUrl,
  importProjectFile, listProjects, newId, saveProject, StorageFullError,
  urlToImageData, type SavedProject,
} from './lib/projects'
import { STRINGS, type Lang, type Strings } from './i18n'

/** Options for the tidy slider, in beads. 0 disables it. */
const ISLAND_STOPS = [0, 2, 3, 4, 6, 8]

export default function App() {
  const [lang, setLang] = useState<Lang>(() =>
    navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en',
  )
  const t: Strings = STRINGS[lang]

  const [image, setImage] = useState<ImageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [canvasSize, setCanvasSize] = useState<CanvasSize>(78)
  const [method, setMethod] = useState<SampleMethod>('average')
  const [showGrid, setShowGrid] = useState(true)

  // Stored as a target colour count rather than a merge-step count: the step
  // count is meaningless once the underlying chart changes, the target is not.
  const [targetColours, setTargetColours] = useState<number | null>(null)
  const [islandStop, setIslandStop] = useState(0)

  const [highlight, setHighlight] = useState<number | null>(null)
  const [placedState, setPlacedState] = useState<{ w: number; h: number; data: Uint8Array } | null>(null)

  const [projects, setProjects] = useState<SavedProject[]>(() => listProjects())
  const [projectId, setProjectId] = useState<string | null>(null)
  const [projectName, setProjectName] = useState('')
  const [savedFlash, setSavedFlash] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => { document.documentElement.lang = lang }, [lang])

  /* ---------- pipeline ---------- */

  // Stage A: the expensive downsample. Recomputed only when the image, the
  // canvas size or the sampling method changes.
  const grid = useMemo(() => {
    if (!image) return null
    const { width, height } = fitGrid(image.width, image.height, canvasSize)
    return pixelate(image, width, height, method)
  }, [image, canvasSize, method])

  // Stage B: cheap palette matching.
  const base = useMemo(() => (grid ? buildChart(grid) : null), [grid])

  // The merge ordering. Computed once per chart; the slider is an index into it.
  const plan = useMemo(() => (base ? buildMergePlan(base.counts) : null), [base])

  const maxColours = plan?.initialCount ?? 1
  const target = Math.min(targetColours ?? maxColours, maxColours)
  const minIsland = ISLAND_STOPS[islandStop]

  // Stage C: simplification. Re-runs on every slider movement, in ~1ms.
  const chart = useMemo(() => {
    if (!base || !plan) return null
    return simplify(base, plan, Math.max(0, plan.initialCount - target), minIsland)
  }, [base, plan, target, minIsland])

  /* ---------- placed-bead progress ---------- */

  const placed = useMemo(() => {
    if (!chart) return null
    if (placedState && placedState.w === chart.width && placedState.h === chart.height) {
      return placedState.data
    }
    return new Uint8Array(chart.width * chart.height)
  }, [chart, placedState])

  const togglePlaced = useCallback((cell: number) => {
    if (!chart || chart.cells[cell] === EMPTY) return
    const { width: w, height: h } = chart
    // Functional update, because ticking beads off comes in fast bursts: a
    // handler that copied the array from its closure would have every tap in
    // a burst overwrite the previous one, and only the last would survive.
    setPlacedState((prev) => {
      const base = prev && prev.w === w && prev.h === h ? prev.data : new Uint8Array(w * h)
      const next = new Uint8Array(base)
      next[cell] = next[cell] ? 0 : 1
      return { w, h, data: next }
    })
  }, [chart])

  const progress = useMemo(() => {
    const m = new Map<number, number>()
    if (!chart || !placed) return m
    for (let i = 0; i < chart.cells.length; i++) {
      if (!placed[i] || chart.cells[i] === EMPTY) continue
      m.set(chart.cells[i], (m.get(chart.cells[i]) ?? 0) + 1)
    }
    return m
  }, [chart, placed])

  // A colour can vanish under the simplify slider while it is being placed.
  useEffect(() => {
    if (highlight === null || !chart) return
    if (!chart.counts.some((c) => c.bead.index === highlight)) setHighlight(null)
  }, [chart, highlight])

  /* ---------- files and projects ---------- */

  const openImage = useCallback(async (file: File) => {
    setError(null)
    try {
      setImage(await loadImageData(file))
      setProjectId(null)
      setProjectName(file.name.replace(/\.[^.]+$/, '').slice(0, 40))
      setTargetColours(null)
      setIslandStop(0)
      setHighlight(null)
      setPlacedState(null)
    } catch {
      setImage(null)
      setError(STRINGS[lang].badImage)
    }
  }, [lang])

  const applyProject = useCallback(async (p: SavedProject) => {
    setError(null)
    try {
      const img = await urlToImageData(p.image)
      setImage(img)
      setCanvasSize(p.settings.canvasSize)
      setMethod(p.settings.method)
      setIslandStop(Math.max(0, ISLAND_STOPS.indexOf(p.settings.minIsland)))
      setProjectId(p.id)
      setProjectName(p.name)
      setHighlight(null)
      const { width, height } = fitGrid(img.width, img.height, p.settings.canvasSize)
      setPlacedState(
        p.placed
          ? { w: width, h: height, data: decodePlaced(p.placed, width * height) }
          : null,
      )
      // Applied last: the chart it refers to has to exist first.
      setTargetColours(p.settings.mergeSteps > 0 ? p.settings.mergeSteps : null)
    } catch {
      setError(STRINGS[lang].badImage)
    }
  }, [lang])

  const doSave = useCallback(() => {
    if (!image || !chart) return
    const id = projectId ?? newId()
    try {
      const list = saveProject({
        id,
        name: projectName.trim() || t.untitled,
        savedAt: Date.now(),
        image: imageDataToUrl(image),
        settings: { canvasSize, method, mergeSteps: target, minIsland },
        placed: placed ? encodePlaced(placed) : undefined,
      })
      setProjects(list)
      setProjectId(id)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1600)
    } catch (e) {
      setError(e instanceof StorageFullError ? t.storageFull : String(e))
    }
  }, [image, chart, projectId, projectName, canvasSize, method, target, minIsland, placed, t])

  const currentProject = useCallback((): SavedProject | null => {
    if (!image) return null
    return {
      id: projectId ?? newId(),
      name: projectName.trim() || t.untitled,
      savedAt: Date.now(),
      image: imageDataToUrl(image),
      settings: { canvasSize, method, mergeSteps: target, minIsland },
      placed: placed ? encodePlaced(placed) : undefined,
    }
  }, [image, projectId, projectName, canvasSize, method, target, minIsland, placed, t])

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
            <button className="ghost" onClick={() => { setImage(null); setError(null); setProjectId(null) }}>
              {t.reset}
            </button>
          )}
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
                  {t.colourCount} <b>{chart.counts.length}</b>
                  {target < maxColours && <span className="was">{t.originalColours} {maxColours}</span>}
                </label>
                <input
                  type="range" min={1} max={maxColours} step={1} value={target}
                  onChange={(e) => setTargetColours(Number(e.target.value))}
                  aria-label={t.colourCount}
                />
              </div>

              <div className="ctrl">
                <label title={t.cleanupHint}>
                  {t.cleanup}{' '}
                  <b>{minIsland === 0 ? t.cleanupOff : `<${minIsland} ${t.cleanupUnit}`}</b>
                </label>
                <input
                  type="range" min={0} max={ISLAND_STOPS.length - 1} step={1} value={islandStop}
                  onChange={(e) => setIslandStop(Number(e.target.value))}
                  aria-label={t.cleanup}
                />
              </div>

              <dl className="stats">
                <div><dt>{t.gridSize}</dt><dd>{chart.width}×{chart.height}</dd></div>
                <div><dt>{t.totalBeads}</dt><dd>{chart.totalBeads.toLocaleString()}</dd></div>
              </dl>
            </div>

            <ChartCanvas
              chart={chart}
              showGrid={showGrid}
              highlight={highlight}
              placed={placed}
              onTogglePlaced={togglePlaced}
            />

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
                  {(progress.get(highlight) ?? 0).toLocaleString()} /{' '}
                  {(chart.counts.find((c) => c.bead.index === highlight)?.count ?? 0).toLocaleString()} {t.done}
                </span>
                <button
                  className="ghost small"
                  onClick={() => setPlacedState({ w: chart.width, h: chart.height, data: new Uint8Array(chart.width * chart.height) })}
                >{t.clearProgress}</button>
              </div>
            )}
            <BeadCounts
              counts={chart.counts}
              total={chart.totalBeads}
              t={t}
              highlight={highlight}
              onHighlight={setHighlight}
              progress={progress}
            />
            <p className="muted small">{t.savedInBrowser}</p>
          </aside>
        </main>
      )}
    </div>
  )
}
