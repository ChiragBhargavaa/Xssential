import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { Pause, Play } from 'lucide-react'
import type { HistoryMode } from '../../lib/hooks'
import { clamp, cx, formatTime } from '../../lib/utils'
import { Button, Kbd } from '../ui'

const MIN_LENGTH = 0.5

type Drag = 'seek' | 'start' | 'end'

export function Timeline({
  duration,
  time,
  start,
  end,
  playing,
  thumbnails,
  onPlayPause,
  onSeek,
  onTrim,
}: {
  duration: number
  time: number
  start: number
  end: number
  playing: boolean
  thumbnails: string[]
  onPlayPause: () => void
  onSeek: (time: number) => void
  onTrim: (start: number, end: number, mode: HistoryMode) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ kind: Drag; start: number; end: number } | null>(null)

  const timeAt = (clientX: number) => {
    const box = trackRef.current!.getBoundingClientRect()
    return clamp((clientX - box.left) / box.width, 0, 1) * duration
  }

  const apply = (e: ReactPointerEvent, mode: HistoryMode) => {
    const d = drag.current
    if (!d) return
    const t = timeAt(e.clientX)
    if (d.kind === 'seek') onSeek(clamp(t, 0, duration))
    else if (d.kind === 'start') {
      const s = clamp(t, 0, end - MIN_LENGTH)
      onTrim(s, end, mode)
      onSeek(s)
    } else {
      const en = clamp(t, start + MIN_LENGTH, duration)
      onTrim(start, en, mode)
      onSeek(en)
    }
  }

  const begin = (kind: Drag) => (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    trackRef.current!.setPointerCapture(e.pointerId)
    drag.current = { kind, start, end }
    apply(e, 'transient')
  }

  const pct = (t: number) => `${(t / duration) * 100}%`

  return (
    <div className="shrink-0 border-t border-neutral-100 bg-white px-5 pt-3 pb-4">
      <div className="mb-2.5 flex items-center gap-3">
        <Button
          size="sm"
          variant="secondary"
          icon={playing ? Pause : Play}
          onClick={onPlayPause}
          title="Play or pause (Space)"
          className="w-20"
        >
          {playing ? 'Pause' : 'Play'}
        </Button>
        <span className="text-xs text-neutral-800 tabular-nums">
          {formatTime(time, true)}{' '}
          <span className="text-neutral-600">/ {formatTime(duration, true)}</span>
        </span>
        <div className="flex-1" />
        <span className="text-xs text-neutral-600">
          Clip{' '}
          <span className="text-neutral-900 tabular-nums">{formatTime(end - start, true)}</span>
          {end - start > 140 && (
            <span className="ml-2 text-x-yellow">Over 2:20, longer videos may need X Premium</span>
          )}
        </span>
        <span className="hidden items-center gap-1 text-[11px] text-neutral-600 lg:flex">
          Trim at playhead <Kbd>I</Kbd> <Kbd>O</Kbd>
        </span>
      </div>

      <div
        ref={trackRef}
        className="relative h-14 cursor-pointer touch-none overflow-hidden rounded-lg bg-neutral-50 ring-1 ring-neutral-200 select-none"
        onPointerDown={begin('seek')}
        onPointerMove={(e) => apply(e, 'transient')}
        onPointerUp={(e) => {
          if (drag.current && drag.current.kind !== 'seek') apply(e, 'commit')
          drag.current = null
        }}
      >
        <div className="absolute inset-0 flex">
          {thumbnails.map((src, i) => (
            <img
              key={i}
              src={src}
              alt=""
              draggable={false}
              className="h-full min-w-0 flex-1 object-cover opacity-80"
            />
          ))}
        </div>
        {/* Trimmed-away parts */}
        <div className="absolute inset-y-0 left-0 bg-white/70" style={{ width: pct(start) }} />
        <div
          className="absolute inset-y-0 right-0 bg-white/70"
          style={{ width: `calc(100% - ${pct(end)})` }}
        />
        {/* Kept range */}
        <div
          className="pointer-events-none absolute inset-y-0 rounded-md border-2 border-x-blue"
          style={{ left: pct(start), width: `calc(${pct(end)} - ${pct(start)})` }}
        />
        {(['start', 'end'] as const).map((edge) => (
          <div
            key={edge}
            onPointerDown={begin(edge)}
            className={cx(
              'absolute inset-y-0 flex w-3 cursor-ew-resize items-center justify-center bg-x-blue',
              edge === 'start' ? 'rounded-l-md' : '-translate-x-full rounded-r-md',
            )}
            style={{ left: pct(edge === 'start' ? start : end) }}
          >
            <div className="h-5 w-0.5 rounded bg-white/70" />
          </div>
        ))}
        {/* Playhead */}
        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-neutral-900 shadow"
          style={{ left: pct(time) }}
        />
      </div>
    </div>
  )
}
