import { useRef } from 'react'
import { ImagePlus } from 'lucide-react'
import type { Background, FramePreset } from '../lib/composition'
import { GRADIENTS, SOLIDS } from '../lib/presets'
import { cx } from '../lib/utils'

const swatch =
  'size-7 shrink-0 rounded-full ring-1 ring-black/10 transition-transform hover:scale-110 [-webkit-app-region:no-drag]'
const selected = 'outline-2 outline-offset-2 outline-x-blue'

const gradientCss = (stops: string[], angle: number) =>
  `linear-gradient(${angle}deg, ${stops.join(', ')})`

function sameGradient(bg: Background, stops: string[]) {
  return bg.kind === 'gradient' && bg.stops.join() === stops.join()
}

export function BackgroundPicker({
  value,
  onChange,
  noneLabel = 'None (transparent)',
}: {
  value: Background
  onChange: (bg: Background) => void
  noneLabel?: string
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const customColor = value.kind === 'solid' && !SOLIDS.includes(value.color) ? value.color : null

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        title={noneLabel}
        onClick={() => onChange({ kind: 'none' })}
        className={cx(swatch, 'checkerboard', value.kind === 'none' && selected)}
      />
      {GRADIENTS.map((g) => (
        <button
          key={g.id}
          type="button"
          title={`Gradient: ${g.id}`}
          onClick={() => onChange({ kind: 'gradient', stops: g.stops, angle: g.angle })}
          className={cx(swatch, sameGradient(value, g.stops) && selected)}
          style={{ background: gradientCss(g.stops, g.angle) }}
        />
      ))}
      {SOLIDS.map((color) => (
        <button
          key={color}
          type="button"
          title={color}
          onClick={() => onChange({ kind: 'solid', color })}
          className={cx(swatch, value.kind === 'solid' && value.color === color && selected)}
          style={{ background: color }}
        />
      ))}
      <label
        title="Custom color"
        className={cx(
          swatch,
          'relative cursor-pointer overflow-hidden',
          customColor !== null && selected,
        )}
        style={{
          background:
            customColor ??
            'conic-gradient(from 90deg, #f43f5e, #eab308, #22c55e, #06b6d4, #6366f1, #d946ef, #f43f5e)',
        }}
      >
        <input
          type="color"
          className="absolute inset-0 cursor-pointer opacity-0"
          value={customColor ?? '#6366f1'}
          onChange={(e) => onChange({ kind: 'solid', color: e.target.value })}
        />
      </label>
      <button
        type="button"
        title="Use an image"
        onClick={() => fileInput.current?.click()}
        className={cx(
          swatch,
          'flex items-center justify-center bg-neutral-100 text-neutral-800',
          value.kind === 'image' && selected,
        )}
        style={
          value.kind === 'image' ? { background: `center / cover url(${value.url})` } : undefined
        }
      >
        {value.kind !== 'image' && <ImagePlus className="size-3.5" />}
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onChange({ kind: 'image', url: URL.createObjectURL(file) })
          e.target.value = ''
        }}
      />
    </div>
  )
}

function RatioBox({ frame, active }: { frame: FramePreset; active: boolean }) {
  const max = 22
  const w = frame.width
    ? frame.width >= frame.height
      ? max
      : (max * frame.width) / frame.height
    : max
  const h = frame.width
    ? frame.height >= frame.width
      ? max
      : (max * frame.height) / frame.width
    : 15
  return (
    <span className="flex size-6 items-center justify-center">
      <span
        className={cx(
          'rounded-[3px] border-[1.5px]',
          frame.width ? '' : 'border-dashed',
          active ? 'border-x-blue' : 'border-neutral-300',
        )}
        style={{ width: w, height: h }}
      />
    </span>
  )
}

export function FramePicker({
  frames,
  value,
  onChange,
  autoSize,
}: {
  frames: FramePreset[]
  value: string
  onChange: (id: string) => void
  // Output size when "auto" is selected, shown under the grid
  autoSize?: { width: number; height: number }
}) {
  const current = frames.find((f) => f.id === value) ?? frames[0]!
  const size = current.width ? current : autoSize
  return (
    <div>
      <div className="grid grid-cols-3 gap-1.5">
        {frames.map((f) => {
          const active = f.id === current.id
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onChange(f.id)}
              className={cx(
                'flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-xs ring-1 transition-colors',
                active
                  ? 'bg-x-blue/10 text-neutral-900 ring-x-blue'
                  : 'bg-white text-neutral-600 ring-neutral-200 hover:bg-neutral-50 hover:text-neutral-900',
              )}
            >
              <RatioBox frame={f} active={active} />
              <span className="leading-tight font-bold">{f.label}</span>
              <span className="leading-none text-neutral-600">{f.ratio}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-2.5 text-[13px] leading-relaxed text-neutral-600">
        {size && (
          <span className="font-bold text-neutral-900 tabular-nums">
            {Math.round(size.width)} × {Math.round(size.height)}
          </span>
        )}
        {size && ' · '}
        {current.note}
      </p>
    </div>
  )
}
