/** Saved projects.
 *
 *  Everything lives in this browser's localStorage — no account, no server.
 *  That is a real limitation, not an oversight: clearing site data loses saves,
 *  which is exactly why export/import to a file exists alongside it.
 */

import { imageHasAlpha } from './loadImage'
import type { CanvasSize, SampleMethod } from './pixelate'

const KEY = 'pindou.projects.v1'
const FILE_VERSION = 1

/** Source images are re-stored small. The grid is at most 104 cells, so a few
 *  source pixels per cell is all the quality that can survive anyway, and it
 *  keeps a dozen projects inside the localStorage budget. */
const STORED_MAX = 640

export interface ProjectSettings {
  canvasSize: CanvasSize
  method: SampleMethod
  mergeSteps: number
  minIsland: number
}

export interface SavedProject {
  id: string
  name: string
  savedAt: number
  /** Downscaled source image, data URL. */
  image: string
  settings: ProjectSettings
}

/* ---------- image <-> data URL ---------- */

export function imageDataToUrl(img: ImageData): string {
  const scale = Math.min(1, STORED_MAX / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))

  const src = document.createElement('canvas')
  src.width = img.width
  src.height = img.height
  src.getContext('2d')!.putImageData(img, 0, 0)

  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')!
  ctx.drawImage(src, 0, 0, w, h)

  // PNG only where transparency must survive; JPEG is far smaller otherwise.
  return imageHasAlpha(img) ? out.toDataURL('image/png') : out.toDataURL('image/jpeg', 0.88)
}

/** Kept for callers that need pixels rather than a source to re-decode. */
export function urlToImageData(url: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const el = new Image()
    el.onload = () => {
      const c = document.createElement('canvas')
      c.width = el.naturalWidth
      c.height = el.naturalHeight
      const ctx = c.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(el, 0, 0)
      resolve(ctx.getImageData(0, 0, c.width, c.height))
    }
    el.onerror = () => reject(new Error('stored image could not be decoded'))
    el.src = url
  })
}

/* ---------- store ---------- */

export function listProjects(): SavedProject[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as SavedProject[]
    return Array.isArray(list) ? list.sort((a, b) => b.savedAt - a.savedAt) : []
  } catch {
    return []
  }
}

export class StorageFullError extends Error {}

export function saveProject(p: SavedProject): SavedProject[] {
  const list = listProjects().filter((x) => x.id !== p.id)
  list.unshift(p)
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    throw new StorageFullError('localStorage is full')
  }
  return list
}

export function deleteProject(id: string): SavedProject[] {
  const list = listProjects().filter((x) => x.id !== id)
  localStorage.setItem(KEY, JSON.stringify(list))
  return list
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/* ---------- file export / import ---------- */

export function exportProjectFile(p: SavedProject) {
  const blob = new Blob([JSON.stringify({ version: FILE_VERSION, project: p })], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${p.name.replace(/[^\w一-龥-]+/g, '_') || 'pindou'}.pindou.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function importProjectFile(file: File): Promise<SavedProject> {
  const data = JSON.parse(await file.text())
  const p = data?.project as SavedProject | undefined
  if (!p?.image || !p?.settings) throw new Error('not a pindou project file')
  // A re-imported project is a new entry rather than overwriting whatever
  // happens to share its id in this browser.
  return { ...p, id: newId(), savedAt: Date.now() }
}
