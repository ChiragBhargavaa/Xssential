import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { Check, RotateCcw, X } from 'lucide-react'
import {
  clampRect,
  computeLayout,
  fullRect,
  isRedactionActive,
  outputToSource,
  renderComposite,
  sourceToOutput,
  type Background,
  type Composition,
  type FramePreset,
  type LayoutLimits,
  type Rect,
  type RedactStyle,
} from '../lib/composition'
import { useElementSize, useKeydown, type HistoryMode } from '../lib/hooks'
import { cx, fitSize, uid } from '../lib/utils'
import { DrawSurface, RectEditor } from './RectEditor'
import { Button, Segmented } from './ui'

export type StageMode = 'select' | 'crop' | 'blur'

export interface StageHandle {
  // Redraws the preview, e.g. when a new video frame is ready
  draw: () => void
}

interface StageProps {
  handle?: RefObject<StageHandle | null>
  source: CanvasImageSource | null
  width: number
  height: number
  comp: Composition
  frames: FramePreset[]
  limits?: LayoutLimits
  mode: StageMode
  onModeChange: (mode: StageMode) => void
  update: (fn: (c: Composition) => Composition, mode?: HistoryMode) => void
  selectedId: string | null
  onSelect: (id: string | null) => void
  backgroundImage?: CanvasImageSource | null
  // Video only: the current time, and the fill shown for a transparent background
  time?: number
  opaque?: string
  newRedaction: { style: RedactStyle; strength: number; start?: number; end?: number }
}

const RAW: Pick<Composition, 'crop' | 'frame' | 'padding' | 'radius' | 'shadow' | 'background'> = {
  crop: null,
  frame: 'auto',
  padding: 0,
  radius: 0,
  shadow: 0,
  background: { kind: 'none' } as Background,
}

const MARGIN = 40
const CROP_BAR = 64

function fitAspect(r: Rect, aspect: number): Rect {
  let w = r.w
  let h = r.h
  if (w / h > aspect) w = h * aspect
  else h = w / aspect
  return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h }
}

const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

export function Stage(props: StageProps) {
  const { comp, mode, width: srcW, height: srcH, frames, limits, update, onSelect } = props
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const area = useElementSize<HTMLDivElement>()
  const cropping = mode === 'crop'

  const layout = useMemo(
    () => computeLayout(comp, srcW, srcH, frames, limits),
    [comp, srcW, srcH, frames, limits],
  )
  // While cropping, the whole source is shown without styling
  const rawComp = useMemo<Composition>(() => ({ ...comp, ...RAW }), [comp])
  const rawLayout = useMemo(() => computeLayout(rawComp, srcW, srcH, []), [rawComp, srcW, srcH])
  const shownLayout = cropping ? rawLayout : layout
  const shownComp = cropping ? rawComp : comp

  const fit = fitSize(
    shownLayout.width,
    shownLayout.height,
    Math.max(1, area.width - MARGIN * 2),
    Math.max(1, area.height - MARGIN * 2 - (cropping ? CROP_BAR : 0)),
  )
  // Never magnify past 1 CSS pixel per output pixel
  const cssScale = Math.min(1, fit.scale)
  const display = { width: shownLayout.width * cssScale, height: shownLayout.height * cssScale }

  const latest = useRef({ ...props, shownLayout, shownComp, display })
  latest.current = { ...props, shownLayout, shownComp, display }

  const draw = useCallback(() => {
    const p = latest.current
    const canvas = canvasRef.current
    if (!canvas || !p.source || p.display.width < 1) return
    const dpr = window.devicePixelRatio || 1
    const pw = Math.max(1, Math.round(p.display.width * dpr))
    const ph = Math.max(1, Math.round(p.display.height * dpr))
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw
      canvas.height = ph
    }
    renderComposite(canvas.getContext('2d')!, p.source, p.shownLayout, p.shownComp, {
      scale: pw / p.shownLayout.width,
      backgroundImage: p.backgroundImage,
      time: p.time,
      opaque: p.opaque,
    })
  }, [])

  useImperativeHandle(props.handle, () => ({ draw }), [draw])
  useLayoutEffect(draw, [
    draw,
    props.source,
    props.backgroundImage,
    props.time,
    shownLayout,
    shownComp,
    display.width,
    display.height,
  ])

  // Crop editing works on a draft in source pixels until it is applied
  const [cropDraft, setCropDraft] = useState<Rect>(() => comp.crop ?? fullRect(srcW, srcH))
  const [cropAspect, setCropAspect] = useState<'free' | 'frame'>('free')
  const frame = frames.find((f) => f.id === comp.frame)
  const frameAspect =
    frame && frame.width
      ? Math.max(1, frame.width - 2 * comp.padding) / Math.max(1, frame.height - 2 * comp.padding)
      : null

  useEffect(() => {
    if (cropping) {
      setCropDraft(comp.crop ?? fullRect(srcW, srcH))
      setCropAspect('free')
    }
    // Reset the draft only when entering crop mode
  }, [cropping])

  const applyCrop = () => {
    const r = clampRect(
      {
        x: Math.round(cropDraft.x),
        y: Math.round(cropDraft.y),
        w: Math.round(cropDraft.w),
        h: Math.round(cropDraft.h),
      },
      srcW,
      srcH,
    )
    const isFull = r.x === 0 && r.y === 0 && r.w === srcW && r.h === srcH
    update((c) => ({ ...c, crop: isFull ? null : r }))
    props.onModeChange('select')
  }

  useKeydown((e) => {
    if (!cropping) return
    if (e.key === 'Enter') {
      e.preventDefault()
      applyCrop()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      props.onModeChange('select')
    }
  })

  const cssPerOut = display.width / shownLayout.width
  const toCss = (r: Rect): Rect => ({
    x: r.x * cssPerOut,
    y: r.y * cssPerOut,
    w: r.w * cssPerOut,
    h: r.h * cssPerOut,
  })
  const fromCss = (r: Rect): Rect => ({
    x: r.x / cssPerOut,
    y: r.y / cssPerOut,
    w: r.w / cssPerOut,
    h: r.h / cssPerOut,
  })
  const contentCss = toCss(layout.content)

  const addRedaction = (css: Rect) => {
    const rect = clampRect(outputToSource(fromCss(css), layout), srcW, srcH)
    const id = uid()
    update((c) => ({ ...c, redactions: [...c.redactions, { id, rect, ...props.newRedaction }] }))
    onSelect(id)
  }

  const moveRedaction = (id: string, css: Rect, phase: 'move' | 'end') => {
    const rect = outputToSource(fromCss(css), layout)
    update(
      (c) => ({ ...c, redactions: c.redactions.map((r) => (r.id === id ? { ...r, rect } : r)) }),
      phase === 'end' ? 'commit' : 'transient',
    )
  }

  const transparent = shownComp.background.kind === 'none' && !props.opaque

  return (
    <div
      ref={area.ref}
      className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden"
    >
      <div
        className={cx('relative', cropping && '-translate-y-6')}
        style={{ width: display.width, height: display.height }}
      >
        <canvas
          ref={canvasRef}
          className={cx(
            'absolute inset-0 shadow-[0_0_0_1px_#2f3336]',
            transparent && 'checkerboard',
          )}
          style={{ width: display.width, height: display.height }}
        />
        {props.source && (
          <div className="absolute inset-0">
            {cropping ? (
              <RectEditor
                variant="crop"
                rect={toCss(cropDraft)}
                bounds={{ x: 0, y: 0, w: display.width, h: display.height }}
                aspect={cropAspect === 'frame' ? frameAspect : null}
                onChange={(r) => setCropDraft(fromCss(r))}
              />
            ) : (
              <>
                {mode === 'blur' ? (
                  <DrawSurface
                    bounds={contentCss}
                    onCreate={addRedaction}
                    onPointerDownEmpty={() => onSelect(null)}
                  />
                ) : (
                  <div className="absolute inset-0" onPointerDown={() => onSelect(null)} />
                )}
                {comp.redactions
                  .filter((r) => intersects(r.rect, layout.crop))
                  .map((r) => (
                    <RectEditor
                      key={r.id}
                      variant="redaction"
                      rect={toCss(sourceToOutput(r.rect, layout))}
                      bounds={contentCss}
                      selected={r.id === props.selectedId}
                      onSelect={() => onSelect(r.id)}
                      onChange={(css, phase) => moveRedaction(r.id, css, phase)}
                    >
                      {!isRedactionActive(r, props.time) && (
                        <div className="pointer-events-none absolute inset-0 bg-neutral-950/40" />
                      )}
                    </RectEditor>
                  ))}
              </>
            )}
          </div>
        )}
      </div>

      {cropping && (
        <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/95 p-1.5 shadow-2xl">
          {frameAspect && (
            <Segmented
              className="w-52"
              value={cropAspect}
              onChange={(v) => {
                setCropAspect(v)
                if (v === 'frame') setCropDraft((d) => fitAspect(d, frameAspect))
              }}
              options={[
                { value: 'free', label: 'Free' },
                { value: 'frame', label: `Fill ${frame?.ratio}` },
              ]}
            />
          )}
          <span className="px-2 text-xs whitespace-nowrap text-neutral-400 tabular-nums">
            {Math.round(cropDraft.w)} × {Math.round(cropDraft.h)}
          </span>
          <Button
            size="sm"
            variant="ghost"
            icon={RotateCcw}
            onClick={() => setCropDraft(fullRect(srcW, srcH))}
          >
            Reset
          </Button>
          <Button size="sm" variant="ghost" icon={X} onClick={() => props.onModeChange('select')}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" icon={Check} onClick={applyCrop}>
            Apply
          </Button>
        </div>
      )}
    </div>
  )
}
