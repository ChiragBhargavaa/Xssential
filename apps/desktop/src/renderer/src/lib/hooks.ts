import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

// 'push' records an undo step. 'transient' updates live (while dragging) and 'commit' closes
// that gesture as a single undo step.
export type HistoryMode = 'push' | 'transient' | 'commit'

interface HistoryState<T> {
  past: T[]
  present: T
  future: T[]
  // State at the start of an ongoing transient gesture
  pending: T | null
}

const LIMIT = 100

export function useHistory<T>(initial: T | (() => T)) {
  const [state, setState] = useState<HistoryState<T>>(() => ({
    past: [],
    present: typeof initial === 'function' ? (initial as () => T)() : initial,
    future: [],
    pending: null,
  }))

  const update = useCallback((fn: (current: T) => T, mode: HistoryMode = 'push') => {
    setState((s) => {
      const next = fn(s.present)
      if (mode === 'transient') return { ...s, present: next, pending: s.pending ?? s.present }
      const base = mode === 'commit' ? (s.pending ?? s.present) : s.present
      if (base === next) return { ...s, present: next, pending: null }
      return { past: [...s.past, base].slice(-LIMIT), present: next, future: [], pending: null }
    })
  }, [])

  const undo = useCallback(() => {
    setState((s) => {
      const base = s.pending ?? s.present
      const previous = s.past[s.past.length - 1]
      if (previous === undefined) return { ...s, present: base, pending: null }
      return {
        past: s.past.slice(0, -1),
        present: previous,
        future: [base, ...s.future],
        pending: null,
      }
    })
  }, [])

  const redo = useCallback(() => {
    setState((s) => {
      const [next, ...rest] = s.future
      if (next === undefined) return s
      return { past: [...s.past, s.present], present: next, future: rest, pending: null }
    })
  }, [])

  // Replaces the state and clears the undo stack
  const reset = useCallback((fn: (current: T) => T) => {
    setState((s) => ({ past: [], present: fn(s.present), future: [], pending: null }))
  }, [])

  return {
    value: state.present,
    update,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  }
}

// Measures an element. Returns a callback ref, so it also works for elements that mount later.
export function useElementSize<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    if (!element) return undefined
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height } = entry.contentRect
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])
  return { ref: setElement, ...size }
}

// Subscribes to window keydown with the latest handler, without re-binding every render
export function useKeydown(handler: (e: KeyboardEvent) => void) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    const listener = (e: KeyboardEvent) => ref.current(e)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])
}

export function useWindowEvent<K extends keyof WindowEventMap>(
  type: K,
  handler: (e: WindowEventMap[K]) => void,
) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    const listener = (e: WindowEventMap[K]) => ref.current(e)
    window.addEventListener(type, listener)
    return () => window.removeEventListener(type, listener)
  }, [type])
}

// Loads an image URL (such as a custom background) into a bitmap
export function useBitmap(url: string | null) {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null)
  useEffect(() => {
    if (!url) {
      setBitmap(null)
      return undefined
    }
    let cancelled = false
    fetch(url)
      .then((r) => r.blob())
      .then((b) => createImageBitmap(b))
      .then((b) => {
        if (!cancelled) setBitmap(b)
      })
      .catch(() => {
        if (!cancelled) setBitmap(null)
      })
    return () => {
      cancelled = true
    }
  }, [url])
  return bitmap
}
