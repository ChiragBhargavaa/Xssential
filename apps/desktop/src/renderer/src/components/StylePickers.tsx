import { useRef } from 'react'
import { ImagePlus } from 'lucide-react'
import type { Background, FramePreset } from '../lib/composition'
import { PHOTOS } from '../lib/presets'
import { cx } from '../lib/utils'

const swatch =
  'size-7 shrink-0 rounded-full ring-1 ring-black/10 transition-transform hover:scale-110 [-webkit-app-region:no-drag]'
const selected = 'outline-2 outline-offset-2 outline-neutral-900'
const colorWheel =
  'conic-gradient(from 90deg, #f43f5e, #eab308, #22c55e, #06b6d4, #6366f1, #d946ef, #f43f5e)'

const option = (active: boolean) =>
  cx(
    'relative flex items-center gap-2 rounded-xl px-2.5 py-2 text-[13px] font-bold ring-1 transition-colors [-webkit-app-region:no-drag]',
    active
      ? 'bg-neutral-50 text-neutral-900 ring-2 ring-neutral-900'
      : 'bg-white text-neutral-600 ring-neutral-200 hover:bg-neutral-50 hover:text-neutral-900',
  )

export function BackgroundPicker({
  value,
  onChange,
}: {
  value: Background
  onChange: (bg: Background) => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const color = value.kind === 'solid' ? value.color : null
  const uploaded = value.kind === 'image' && !value.photo ? value.url : null

  const upload = async (file: File) => {
    try {
      const data = new Uint8Array(await file.arrayBuffer())
      onChange({ kind: 'image', url: await window.api.backgrounds.save(data, file.type) })
    } catch {
      // An image the app can't keep is still used until the editor closes
      onChange({ kind: 'image', url: URL.createObjectURL(file) })
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {PHOTOS.map((p) => (
          <button
            key={p.id}
            type="button"
            title={`Photo by ${p.author} on Unsplash`}
            onClick={() => onChange({ kind: 'image', url: p.url, photo: p.id })}
            className={cx(swatch, value.kind === 'image' && value.photo === p.id && selected)}
            style={{ background: `center / cover url(${p.thumb})` }}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          title="Choose an image from your computer"
          onClick={() => fileInput.current?.click()}
          className={option(uploaded !== null)}
        >
          <span
            className="flex size-5 shrink-0 items-center justify-center rounded-full bg-neutral-100 ring-1 ring-black/10"
            style={uploaded ? { background: `center / cover url(${uploaded})` } : undefined}
          >
            {!uploaded && <ImagePlus className="size-3" />}
          </span>
          Your image
        </button>
        <label title="Pick a color" className={cx(option(color !== null), 'cursor-pointer')}>
          <span
            className="size-5 shrink-0 rounded-full ring-1 ring-black/10"
            style={{ background: color ?? colorWheel }}
          />
          Color
          <input
            type="color"
            className="absolute inset-0 cursor-pointer opacity-0"
            value={color ?? '#1d9bf0'}
            onChange={(e) => onChange({ kind: 'solid', color: e.target.value })}
          />
        </label>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void upload(file)
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
          active ? 'border-neutral-900' : 'border-neutral-300',
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
      <div className={cx('grid gap-1.5', frames.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
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
                  ? 'bg-neutral-50 font-bold text-neutral-900 ring-2 ring-neutral-900'
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
