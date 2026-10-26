export const cx = (...classes: (string | false | null | undefined)[]): string =>
  classes.filter(Boolean).join(' ')

export const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v))

export const uid = (): string => Math.random().toString(36).slice(2, 10)

export const isMac = window.api.platform === 'darwin'
export const modKey = isMac ? '⌘' : 'Ctrl'

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function formatTime(seconds: number, precise = false): string {
  const s = Math.max(0, seconds)
  const m = Math.floor(s / 60)
  const rest = s - m * 60
  const sec = precise ? rest.toFixed(1).padStart(4, '0') : String(Math.floor(rest)).padStart(2, '0')
  return `${m}:${sec}`
}

export async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

export function fitSize(w: number, h: number, maxW: number, maxH: number) {
  const s = Math.min(maxW / w, maxH / h)
  return { width: w * s, height: h * s, scale: s }
}

export const isTextInput = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    (target instanceof HTMLInputElement &&
      !['range', 'checkbox', 'radio', 'button', 'color', 'file'].includes(target.type)) ||
    target instanceof HTMLTextAreaElement)

export const errorMessage = (err: unknown): string => {
  const message = err instanceof Error ? err.message : String(err)
  // Strip Electron's "Error invoking remote method 'x': Error: " prefix
  return message.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '')
}

export const timestampName = (prefix: string, ext: string): string => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${prefix} ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} at ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}.${ext}`
}
