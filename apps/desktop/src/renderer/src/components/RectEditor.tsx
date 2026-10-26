import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { Rect } from '../lib/composition'
import { clamp, cx } from '../lib/utils'

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'move'

const MIN = 8
const CORNERS: Handle[] = ['nw', 'ne', 'sw', 'se']
const EDGES: Handle[] = ['n', 's', 'e', 'w']

const handlePosition: Record<Exclude<Handle, 'move'>, string> = {
  nw: '-left-1.5 -top-1.5 cursor-nwse-resize',
  ne: '-right-1.5 -top-1.5 cursor-nesw-resize',
  sw: '-left-1.5 -bottom-1.5 cursor-nesw-resize',
  se: '-right-1.5 -bottom-1.5 cursor-nwse-resize',
  n: 'left-1/2 -top-1.5 -translate-x-1/2 cursor-ns-resize',
  s: 'left-1/2 -bottom-1.5 -translate-x-1/2 cursor-ns-resize',
  e: '-right-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize',
  w: '-left-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize',
}

function applyDrag(
  r0: Rect,
  handle: Handle,
  dx: number,
  dy: number,
  bounds: Rect,
  aspect?: number | null,
): Rect {
  if (handle === 'move') {
    return {
      ...r0,
      x: clamp(r0.x + dx, bounds.x, bounds.x + bounds.w - r0.w),
      y: clamp(r0.y + dy, bounds.y, bounds.y + bounds.h - r0.h),
    }
  }
  let x0 = r0.x
  let y0 = r0.y
  let x1 = r0.x + r0.w
  let y1 = r0.y + r0.h
  if (handle.includes('w')) x0 = clamp(x0 + dx, bounds.x, x1 - MIN)
  if (handle.includes('e')) x1 = clamp(x1 + dx, x0 + MIN, bounds.x + bounds.w)
  if (handle.includes('n')) y0 = clamp(y0 + dy, bounds.y, y1 - MIN)
  if (handle.includes('s')) y1 = clamp(y1 + dy, y0 + MIN, bounds.y + bounds.h)
  if (aspect && handle.length === 2) {
    // Shrink the longer side to keep the ratio; shrinking always stays inside the bounds
    let w = x1 - x0
    let h = y1 - y0
    if (w / h > aspect) w = h * aspect
    else h = w / aspect
    if (handle.includes('w')) x0 = x1 - w
    else x1 = x0 + w
    if (handle.includes('n')) y0 = y1 - h
    else y1 = y0 + h
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

interface RectEditorProps {
  rect: Rect
  bounds: Rect
  onChange: (rect: Rect, phase: 'move' | 'end') => void
  variant: 'crop' | 'redaction'
  selected?: boolean
  onSelect?: () => void
  aspect?: number | null
  children?: ReactNode
}

// A rectangle that can be moved and resized with the mouse. Coordinates are CSS pixels
// relative to the positioned parent.
export function RectEditor({
  rect,
  bounds,
  onChange,
  variant,
  selected = true,
  onSelect,
  aspect,
  children,
}: RectEditorProps) {
  const drag = useRef<{ x: number; y: number; rect: Rect; handle: Handle; last: Rect } | null>(null)

  const start = (handle: Handle) => (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    onSelect?.()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, rect, handle, last: rect }
  }

  const move = (e: ReactPointerEvent) => {
    const d = drag.current
    if (!d) return
    const next = applyDrag(d.rect, d.handle, e.clientX - d.x, e.clientY - d.y, bounds, aspect)
    d.last = next
    onChange(next, 'move')
  }

  const end = () => {
    const d = drag.current
    if (!d) return
    drag.current = null
    onChange(d.last, 'end')
  }

  const handles = aspect ? CORNERS : [...CORNERS, ...EDGES]
  const showHandles = selected

  return (
    <div
      className={cx(
        'absolute',
        variant === 'crop'
          ? 'cursor-move border border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]'
          : cx(
              'cursor-move border-[1.5px]',
              selected ? 'border-x-blue' : 'border-white/60 border-dashed hover:border-white/90',
            ),
      )}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      onPointerDown={start('move')}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {variant === 'crop' && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-y-0 left-1/3 w-px bg-white/25" />
          <div className="absolute inset-y-0 left-2/3 w-px bg-white/25" />
          <div className="absolute inset-x-0 top-1/3 h-px bg-white/25" />
          <div className="absolute inset-x-0 top-2/3 h-px bg-white/25" />
        </div>
      )}
      {children}
      {showHandles &&
        handles.map((h) => (
          <div
            key={h}
            className={cx(
              'absolute size-3 rounded-[3px] border border-neutral-900/40 bg-white shadow',
              handlePosition[h as Exclude<Handle, 'move'>],
            )}
            // Move and up events bubble to the rectangle's own handlers
            onPointerDown={start(h)}
          />
        ))}
    </div>
  )
}

// Lets the user drag out a new rectangle inside `bounds`
export function DrawSurface({
  bounds,
  onCreate,
  onPointerDownEmpty,
  className,
}: {
  bounds: Rect
  onCreate: (rect: Rect) => void
  onPointerDownEmpty?: () => void
  className?: string
}) {
  const [draft, setDraft] = useState<Rect | null>(null)
  const origin = useRef<{ x: number; y: number; left: number; top: number } | null>(null)

  const point = (e: ReactPointerEvent) => {
    const o = origin.current!
    return {
      x: clamp(e.clientX - o.left, bounds.x, bounds.x + bounds.w),
      y: clamp(e.clientY - o.top, bounds.y, bounds.y + bounds.h),
    }
  }

  return (
    <div
      className={cx('absolute inset-0 cursor-crosshair', className)}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        onPointerDownEmpty?.()
        const box = e.currentTarget.getBoundingClientRect()
        origin.current = { x: 0, y: 0, left: box.left, top: box.top }
        const p = point(e)
        origin.current = { ...origin.current, x: p.x, y: p.y }
        e.currentTarget.setPointerCapture(e.pointerId)
        setDraft({ x: p.x, y: p.y, w: 0, h: 0 })
      }}
      onPointerMove={(e) => {
        const o = origin.current
        if (!o) return
        const p = point(e)
        setDraft({
          x: Math.min(o.x, p.x),
          y: Math.min(o.y, p.y),
          w: Math.abs(p.x - o.x),
          h: Math.abs(p.y - o.y),
        })
      }}
      onPointerUp={() => {
        origin.current = null
        if (draft && draft.w >= 6 && draft.h >= 6) onCreate(draft)
        setDraft(null)
      }}
      onPointerCancel={() => {
        origin.current = null
        setDraft(null)
      }}
    >
      {draft && (
        <div
          className="pointer-events-none absolute border-[1.5px] border-x-blue bg-x-blue/15"
          style={{ left: draft.x, top: draft.y, width: draft.w, height: draft.h }}
        />
      )}
    </div>
  )
}
