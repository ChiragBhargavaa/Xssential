import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ClipboardPaste,
  Copy,
  Download,
  FolderOpen,
  GalleryHorizontalEnd,
  Info,
} from 'lucide-react'
import { DropOverlay, EmptyState, useFileDrop } from '../components/EmptyState'
import { FramePicker } from '../components/StylePickers'
import {
  Button,
  IconButton,
  Section,
  Segmented,
  Slider,
  TitleBar,
  Toggle,
  ToolbarDivider,
} from '../components/ui'
import {
  CAROUSEL_FORMATS,
  edgeColor,
  measureLineEnergy,
  planCarousel,
  renderSlide,
  slideBlob,
  X_IMAGES_PER_POST,
  type CarouselPlan,
  type Direction,
  type SlideStyle,
} from '../lib/carousel'
import type { FramePreset } from '../lib/composition'
import { useElementSize, useWindowEvent } from '../lib/hooks'
import { X_IMAGE_LIMIT } from '../lib/presets'
import { savedToast, toast } from '../lib/toast'
import { blobToBytes, errorMessage, isTextInput } from '../lib/utils'

interface Source {
  image: ImageBitmap
  name: string
}

type CountOption = 'auto' | '2' | '3' | '4'

function SlidePreview({
  image,
  plan,
  format,
  index,
  style,
  height,
}: {
  image: ImageBitmap
  plan: CarouselPlan
  format: FramePreset
  index: number
  style: SlideStyle
  height: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const width = (height * format.width) / format.height

  useLayoutEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    renderSlide(
      canvas.getContext('2d')!,
      image,
      plan,
      format,
      index,
      style,
      canvas.width / format.width,
    )
  }, [image, plan, format, index, style, width, height])

  return (
    <canvas
      ref={ref}
      className="rounded-md shadow-lg shadow-neutral-900/15"
      style={{ width, height }}
    />
  )
}

export default function Carousel() {
  const [source, setSource] = useState<Source | null>(null)
  const [formatId, setFormatId] = useState(CAROUSEL_FORMATS[0]!.id)
  const [directionChoice, setDirectionChoice] = useState<'auto' | Direction>('auto')
  const [count, setCount] = useState<CountOption>('auto')
  const [margin, setMargin] = useState(0)
  const [smartCuts, setSmartCuts] = useState(true)
  const [numbers, setNumbers] = useState(false)
  const [matchBackground, setMatchBackground] = useState(true)
  const [customBackground, setCustomBackground] = useState('#ffffff')
  const [exporting, setExporting] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const strip = useElementSize<HTMLDivElement>()

  const load = async (blob: Blob, name: string) => {
    try {
      const image = await createImageBitmap(blob)
      setSource({ image, name: name.replace(/\.[^.]+$/, '') || 'carousel' })
    } catch {
      toast('That file is not an image Xssential can open.', { tone: 'error' })
    }
  }

  const format = CAROUSEL_FORMATS.find((f) => f.id === formatId) ?? CAROUSEL_FORMATS[0]!
  const direction: Direction =
    directionChoice !== 'auto'
      ? directionChoice
      : source && source.image.width > source.image.height * 1.5
        ? 'horizontal'
        : 'vertical'

  const energy = useMemo(
    () => (source ? measureLineEnergy(source.image, direction) : null),
    [source, direction],
  )
  const autoBackground = useMemo(() => (source ? edgeColor(source.image) : '#ffffff'), [source])

  const plan = useMemo(
    () =>
      source
        ? planCarousel(
            source.image.width,
            source.image.height,
            {
              format,
              direction,
              count: count === 'auto' ? 'auto' : Number(count),
              margin,
              smartCuts,
            },
            energy,
          )
        : null,
    [source, format, direction, count, margin, smartCuts, energy],
  )

  const style = useMemo<SlideStyle>(
    () => ({ background: matchBackground ? autoBackground : customBackground, numbers, margin }),
    [matchBackground, autoBackground, customBackground, numbers, margin],
  )

  const pasteFromClipboard = async () => {
    const png = await window.api.clipboard.readImage()
    if (png)
      await load(new Blob([png as Uint8Array<ArrayBuffer>], { type: 'image/png' }), 'carousel')
    else toast('There is no image on the clipboard.', { tone: 'warning' })
  }

  useWindowEvent('paste', (e) => {
    if (isTextInput(e.target)) return
    const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
    if (file) {
      e.preventDefault()
      void load(file, file.name)
    }
  })

  const dragging = useFileDrop(
    (f) => f.type.startsWith('image/'),
    (f) => void load(f, f.name),
  )

  // X allows 5 MB per image; very detailed slides fall back to JPEG
  const encodeSlide = async (index: number) => {
    if (!source || !plan) throw new Error('No image')
    const png = await slideBlob(source.image, plan, format, index, style)
    if (png.size <= X_IMAGE_LIMIT) return { blob: png, ext: 'png' }
    return {
      blob: await slideBlob(source.image, plan, format, index, style, 'image/jpeg'),
      ext: 'jpg',
    }
  }

  const copySlide = async (index: number) => {
    try {
      const png = await slideBlob(source!.image, plan!, format, index, style)
      await window.api.clipboard.writeImage(await blobToBytes(png))
      toast(`Slide ${index + 1} copied. Paste it into your post.`, { tone: 'success' })
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' })
    }
  }

  const exportAll = async () => {
    if (!source || !plan) return
    setExporting(true)
    try {
      const files: { name: string; data: Uint8Array }[] = []
      for (let i = 0; i < plan.slices.length; i++) {
        const { blob, ext } = await encodeSlide(i)
        const number = String(i + 1).padStart(2, '0')
        files.push({ name: `${source.name}-${number}.${ext}`, data: await blobToBytes(blob) })
      }
      const dir = await window.api.files.saveMany({
        files,
        title: 'Choose a folder for the slides',
      })
      if (dir) savedToast(dir, ` · ${files.length} slides`)
    } catch (err) {
      toast(errorMessage(err), { tone: 'error' })
    } finally {
      setExporting(false)
    }
  }

  const openInput = (
    <input
      ref={fileInput}
      type="file"
      accept="image/*"
      hidden
      onChange={(e) => {
        const file = e.target.files?.[0]
        if (file) void load(file, file.name)
        e.target.value = ''
      }}
    />
  )

  if (!source || !plan) {
    return (
      <div className="flex h-full flex-col">
        <TitleBar>
          <span className="text-[13px] font-medium text-neutral-600">Carousel</span>
        </TitleBar>
        <EmptyState
          icon={GalleryHorizontalEnd}
          title="Turn a long image into an X carousel"
          description="Open a long screenshot (a thread, an article, a chat) or a wide panorama. Xssential splits it into same-size slides that people swipe through on X."
        >
          <Button variant="primary" icon={FolderOpen} onClick={() => fileInput.current?.click()}>
            Open image
          </Button>
          <Button icon={ClipboardPaste} onClick={pasteFromClipboard}>
            Paste
          </Button>
        </EmptyState>
        {openInput}
        <DropOverlay show={dragging} label="Drop to split the image" />
      </div>
    )
  }

  const slides = plan.slices.map((_, i) => i)
  const posts: number[][] = []
  for (let i = 0; i < slides.length; i += X_IMAGES_PER_POST) {
    posts.push(slides.slice(i, i + X_IMAGES_PER_POST))
  }
  const cardHeight = Math.max(160, Math.min(620, strip.height - 120))

  return (
    <div className="flex h-full flex-col">
      <TitleBar>
        <IconButton
          icon={FolderOpen}
          label="Open another image"
          onClick={() => fileInput.current?.click()}
        />
        <IconButton icon={ClipboardPaste} label="Paste image" onClick={pasteFromClipboard} />
        <ToolbarDivider />
        <span className="truncate text-[13px] text-neutral-600">
          {source.name} · {source.image.width} × {source.image.height}
        </span>
        <div className="flex-1" />
        <span className="mr-2 text-xs text-neutral-600">
          {plan.slices.length} {plan.slices.length === 1 ? 'slide' : 'slides'} · {format.width} ×{' '}
          {format.height}
        </span>
        <Button variant="primary" icon={Download} loading={exporting} onClick={exportAll}>
          Save all slides
        </Button>
      </TitleBar>

      <div className="flex min-h-0 flex-1">
        <div
          ref={strip.ref}
          className="flex min-w-0 flex-1 items-center overflow-x-auto bg-neutral-50"
        >
          <div className="flex items-start gap-10 px-10 py-6">
            {posts.map((post, p) => (
              <div key={p} className="shrink-0">
                <div className="mb-3 flex items-baseline gap-2">
                  <span className="text-[13px] font-medium text-neutral-900">
                    {posts.length > 1 ? `Post ${p + 1}` : 'Your post'}
                  </span>
                  <span className="text-xs text-neutral-600">
                    {p === 0
                      ? `${post.length} ${post.length === 1 ? 'image' : 'images'}`
                      : 'Reply to the previous post to continue the thread'}
                  </span>
                </div>
                <div className="flex gap-3">
                  {post.map((i) => (
                    <div key={i} className="group">
                      <SlidePreview
                        image={source.image}
                        plan={plan}
                        format={format}
                        index={i}
                        style={style}
                        height={cardHeight}
                      />
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-neutral-600">Slide {i + 1}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={Copy}
                          className="opacity-60 group-hover:opacity-100"
                          onClick={() => copySlide(i)}
                        >
                          Copy
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="w-80 shrink-0 overflow-y-auto border-l border-neutral-100 bg-white">
          <Section title="Slide size">
            <FramePicker frames={CAROUSEL_FORMATS} value={format.id} onChange={setFormatId} />
          </Section>
          <Section title="Split">
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 text-xs text-neutral-800">Direction</div>
                <Segmented
                  value={directionChoice}
                  onChange={setDirectionChoice}
                  options={[
                    { value: 'auto', label: 'Auto' },
                    { value: 'vertical', label: 'Vertical' },
                    { value: 'horizontal', label: 'Horizontal' },
                  ]}
                />
              </div>
              <div>
                <div className="mb-1.5 text-xs text-neutral-800">Slides</div>
                <Segmented
                  value={count}
                  onChange={setCount}
                  options={[
                    { value: 'auto', label: 'Fit width' },
                    { value: '2', label: '2' },
                    { value: '3', label: '3' },
                    { value: '4', label: '4' },
                  ]}
                />
                <p className="mt-2 text-xs leading-relaxed text-neutral-600">
                  {count === 'auto'
                    ? 'Keeps the image as large as possible and adds slides as needed.'
                    : 'Shrinks the image so it fits in exactly this many slides.'}
                </p>
              </div>
              <Toggle
                label="Avoid cutting through text"
                description="Moves each cut to the nearest blank line."
                checked={smartCuts}
                onChange={setSmartCuts}
              />
            </div>
          </Section>
          <Section title="Look">
            <div className="space-y-4">
              <Slider
                label="Margin"
                value={margin}
                min={0}
                max={160}
                unit=" px"
                onChange={(v) => setMargin(v)}
              />
              <Toggle
                label="Match the image background"
                description="Fills empty space with the color around the image's edges."
                checked={matchBackground}
                onChange={setMatchBackground}
              />
              {!matchBackground && (
                <label className="flex items-center justify-between text-xs text-neutral-800">
                  Background color
                  <input
                    type="color"
                    value={customBackground}
                    onChange={(e) => setCustomBackground(e.target.value)}
                    className="h-7 w-12 cursor-pointer rounded border-0 bg-transparent"
                  />
                </label>
              )}
              <Toggle
                label="Slide numbers"
                description="Adds a small 1/4 badge."
                checked={numbers}
                onChange={setNumbers}
              />
            </div>
          </Section>
          <div className="px-4 py-4">
            <div className="flex gap-2.5 rounded-xl bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-600 ring-1 ring-neutral-200">
              <Info className="mt-0.5 size-3.5 shrink-0 text-x-blue" />
              <p>
                X shows up to {X_IMAGES_PER_POST} images per post as a swipeable carousel. Keep
                every slide the same shape; portrait 4:5 or 3:4 shows in full on the web and in the
                app. Upload the slides in order.
              </p>
            </div>
          </div>
        </aside>
      </div>
      {openInput}
      <DropOverlay show={dragging} label="Drop to split the image" />
    </div>
  )
}
