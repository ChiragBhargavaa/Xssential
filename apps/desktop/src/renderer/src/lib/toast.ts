import { useSyncExternalStore } from 'react'
import { uid } from './utils'

export type ToastTone = 'info' | 'success' | 'warning' | 'error'

export interface Toast {
  id: string
  message: string
  tone: ToastTone
  action?: { label: string; run: () => void }
}

let toasts: Toast[] = []
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function dismissToast(id: string): void {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function toast(
  message: string,
  opts: { tone?: ToastTone; action?: Toast['action']; duration?: number } = {},
): void {
  const t: Toast = { id: uid(), message, tone: opts.tone ?? 'info', action: opts.action }
  toasts = [...toasts.slice(-3), t]
  emit()
  setTimeout(() => dismissToast(t.id), opts.duration ?? (opts.tone === 'error' ? 8000 : 4500))
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => toasts,
  )
}

// Shows a "saved" toast with a button that reveals the file
export function savedToast(path: string, extra = ''): void {
  const name = path.split(/[\\/]/).pop()
  toast(`Saved ${name}${extra}`, {
    tone: 'success',
    action: {
      label: window.api.platform === 'darwin' ? 'Show in Finder' : 'Show in folder',
      run: () => window.api.files.reveal(path),
    },
  })
}
