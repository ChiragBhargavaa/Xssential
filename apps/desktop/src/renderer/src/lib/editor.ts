import type { StageMode } from '../components/Stage'
import type { Composition, FramePreset } from './composition'
import { defaultComposition, photoBackground } from './presets'
import { isTextInput } from './utils'

type StyleKeys = 'frame' | 'padding' | 'radius' | 'shadow' | 'background'

// The last used look (size, background, padding...) is remembered per editor, so a brand
// style only has to be set up once. Uploaded images are blob URLs and can't be kept (the
// built-in photos are), and a size the editor no longer offers falls back to its first one.
export function loadStyle(key: string, frames: FramePreset[]): Composition {
  const base = defaultComposition(frames[0]!.id)
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<Composition> | null
    if (!saved) return base
    const style = { ...base, ...pickStyle(saved as Composition) }
    if (style.background.kind === 'image') {
      style.background = photoBackground(style.background.photo) ?? base.background
    }
    if (!frames.some((f) => f.id === style.frame)) style.frame = base.frame
    return style
  } catch {
    return base
  }
}

function pickStyle(c: Composition): Pick<Composition, StyleKeys> {
  return {
    frame: c.frame,
    padding: c.padding,
    radius: c.radius,
    shadow: c.shadow,
    background: c.background,
  }
}

export function saveStyle(key: string, comp: Composition): void {
  try {
    localStorage.setItem(key, JSON.stringify(pickStyle(comp)))
  } catch {
    // Storage can be unavailable; the style just isn't remembered then
  }
}

interface EditorKeyActions {
  mode: StageMode
  setMode: (mode: StageMode) => void
  undo: () => void
  redo: () => void
  deleteSelected: () => void
  deselect: () => void
}

// Shortcuts shared by the image and video editors. Returns true when the key was used.
export function handleEditorKey(e: KeyboardEvent, a: EditorKeyActions): boolean {
  if (isTextInput(e.target)) return false
  const mod = e.metaKey || e.ctrlKey
  const key = e.key.toLowerCase()
  if (mod && key === 'z') {
    if (e.shiftKey) a.redo()
    else a.undo()
    return true
  }
  if (mod && key === 'y') {
    a.redo()
    return true
  }
  if (mod || e.altKey || a.mode === 'crop') return false
  if (key === 'v') a.setMode('select')
  else if (key === 'c') a.setMode('crop')
  else if (key === 'b') a.setMode('blur')
  else if (key === 'backspace' || key === 'delete') a.deleteSelected()
  else if (key === 'escape') {
    a.deselect()
    a.setMode('select')
  } else return false
  return true
}
