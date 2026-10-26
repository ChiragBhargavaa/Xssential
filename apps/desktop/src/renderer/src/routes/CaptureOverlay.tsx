import { useEffect, useRef, useState } from 'react'
import type { CaptureFrame } from '../../../shared/tools'
import type { Rect } from '../lib/composition'
import { useKeydown } from '../lib/hooks'

const LOUPE = 120
const LOUPE_PIXELS = 15

// Native bitmaps are BGRA (and may pad rows); canvases want tightly packed RGBA
function toImageData(frame: CaptureFrame): ImageData {
  const { width, height, data } = frame
  const stride = data.byteLength / height
  const out = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const row = y * stride
    const dst = y * width * 4
    for (let x = 0; x < width * 4; x += 4) {
      out[dst + x] = data[row + x + 2]!
      out[dst + x + 1] = data[row + x + 1]!
      out[dst + x + 2] = data[row + x]!
      out[dst + x + 3] = 255
    }
  }
  return new ImageData(out, width, height)
}

export default function CaptureOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const loupeRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [selection, setSelection] = useState<Rect | null>(null)
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
  const origin = useRef<{ x: number; y: number } | null>(null)
  const finished = useRef(false)

  useEffect(() => {
    let cancelled = false
    window.api.capture.getFrame().then((frame) => {
      if (cancelled) return
      const canvas = canvasRef.current
      if (!frame || !canvas) {
        window.api.capture.cancel()
        return
      }
      canvas.width = frame.width
      canvas.height = frame.height
      canvas.getContext('2d')!.putImageData(toImageData(frame), 0, 0)
      setSize({ width: frame.width, height: frame.height })
      // Show the window only once the frozen frame is drawn, so there is no flash. A timer,
      // not requestAnimationFrame: the window is still hidden, and hidden pages get no frames.
      setTimeout(() => window.api.capture.ready(), 30)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Device pixels per CSS pixel of the overlay
  const ratio = size ? size.width / window.innerWidth : 1

  const finish = async (rect: Rect | null) => {
    const canvas = canvasRef.current
    if (finished.current || !canvas || !size) return
    finished.current = true
    const r = rect
      ? {
          x: Math.round(rect.x * ratio),
          y: Math.round(rect.y * ratio),
          w: Math.max(1, Math.round(rect.w * ratio)),
          h: Math.max(1, Math.round(rect.h * ratio)),
        }
      : { x: 0, y: 0, w: size.width, h: size.height }
    window.api.capture.hide()
    const out = new OffscreenCanvas(r.w, r.h)
    out.getContext('2d')!.drawImage(canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h)
    const blob = await out.convertToBlob({ type: 'image/png' })
    window.api.capture.done(new Uint8Array(await blob.arrayBuffer()))
  }

  useKeydown((e) => {
    if (e.key === 'Escape') window.api.capture.cancel()
    else if (e.key === 'Enter' || e.key === ' ') void finish(null)
  })

  const drawLoupe = (x: number, y: number) => {
    const loupe = loupeRef.current?.getContext('2d')
    const canvas = canvasRef.current
    if (!loupe || !canvas) return
    loupe.imageSmoothingEnabled = false
    loupe.fillStyle = '#000'
    loupe.fillRect(0, 0, LOUPE, LOUPE)
    const half = LOUPE_PIXELS / 2
    loupe.drawImage(
      canvas,
      x * ratio - half,
      y * ratio - half,
      LOUPE_PIXELS,
      LOUPE_PIXELS,
      0,
      0,
      LOUPE,
      LOUPE,
    )
    const cell = LOUPE / LOUPE_PIXELS
    loupe.strokeStyle = '#1d9bf0'
    loupe.lineWidth = 1
    loupe.strokeRect(
      Math.floor(LOUPE / 2 - cell / 2) + 0.5,
      Math.floor(LOUPE / 2 - cell / 2) + 0.5,
      cell,
      cell,
    )
  }

  const label = selection
    ? `${Math.round(selection.w * ratio)} × ${Math.round(selection.h * ratio)}`
    : pointer
      ? `${Math.round(pointer.x * ratio)}, ${Math.round(pointer.y * ratio)}`
      : ''

  // Keep the loupe on screen near the edges
  const loupePos = pointer && {
    left: pointer.x + 24 + LOUPE > window.innerWidth ? pointer.x - 24 - LOUPE : pointer.x + 24,
    top:
      pointer.y + 24 + LOUPE + 28 > window.innerHeight
        ? pointer.y - 24 - LOUPE - 28
        : pointer.y + 24,
  }

  return (
    <div
      className="fixed inset-0 cursor-crosshair overflow-hidden select-none"
      onContextMenu={() => window.api.capture.cancel()}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        origin.current = { x: e.clientX, y: e.clientY }
        setSelection(null)
      }}
      onPointerMove={(e) => {
        setPointer({ x: e.clientX, y: e.clientY })
        drawLoupe(e.clientX, e.clientY)
        const o = origin.current
        if (!o) return
        setSelection({
          x: Math.min(o.x, e.clientX),
          y: Math.min(o.y, e.clientY),
          w: Math.abs(e.clientX - o.x),
          h: Math.abs(e.clientY - o.y),
        })
      }}
      onPointerUp={() => {
        origin.current = null
        if (selection && selection.w >= 4 && selection.h >= 4) void finish(selection)
        else setSelection(null)
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {selection ? (
        <div
          className="pointer-events-none absolute border border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
          style={{ left: selection.x, top: selection.y, width: selection.w, height: selection.h }}
        />
      ) : (
        <>
          <div className="pointer-events-none absolute inset-0 bg-black/25" />
          {pointer && (
            <>
              <div
                className="pointer-events-none absolute inset-y-0 w-px bg-white/40"
                style={{ left: pointer.x }}
              />
              <div
                className="pointer-events-none absolute inset-x-0 h-px bg-white/40"
                style={{ top: pointer.y }}
              />
            </>
          )}
        </>
      )}

      {size && (
        <div className="pointer-events-none absolute top-6 left-1/2 -translate-x-1/2 rounded-full bg-black/90 px-4 py-2 text-sm text-white shadow-[0_0_15px_rgba(255,255,255,0.2)]">
          Drag to capture · <b className="font-bold">Enter</b> for the full screen ·{' '}
          <b className="font-bold">Esc</b> to cancel
        </div>
      )}

      {pointer && loupePos && (
        <div
          className="pointer-events-none absolute flex flex-col items-center gap-1"
          style={loupePos}
        >
          <canvas
            ref={loupeRef}
            width={LOUPE}
            height={LOUPE}
            className="rounded-full shadow-2xl ring-2 ring-white/80"
            style={{ width: LOUPE, height: LOUPE }}
          />
          <span className="rounded-full bg-black/90 px-2.5 py-0.5 text-xs font-bold text-white tabular-nums">
            {label}
          </span>
        </div>
      )}
    </div>
  )
}
