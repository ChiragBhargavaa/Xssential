import type { FramePreset } from './composition'

// Slide shapes for X's multi-image posts. Since mid-2026 X shows posts with 2–4 images as a
// swipeable carousel. Measurements published in August 2026 found that portrait shapes from
// 3:4 to 8:9 (and square) show uncropped on both the web and iOS, landscape shapes are
// capped at 20:17, and 9:16 is only shown in full on iOS. All slides should share one shape.
export const CAROUSEL_FORMATS: FramePreset[] = [
  {
    id: '4:5',
    label: 'Portrait',
    ratio: '4:5',
    width: 1080,
    height: 1350,
    note: 'Recommended. Uncropped on the web and in the app.',
  },
  {
    id: '3:4',
    label: 'Tall',
    ratio: '3:4',
    width: 1080,
    height: 1440,
    note: 'Tallest shape shown uncropped on the web. Fewer slides for long images.',
  },
  {
    id: '1:1',
    label: 'Square',
    ratio: '1:1',
    width: 1080,
    height: 1080,
    note: 'Safe everywhere, including the older grid layout.',
  },
  {
    id: '9:16',
    label: 'Story',
    ratio: '9:16',
    width: 1080,
    height: 1920,
    note: 'Full height on iOS only; the web crops the top and bottom.',
  },
  {
    id: '20:17',
    label: 'Landscape',
    ratio: '20:17',
    width: 1200,
    height: 1020,
    note: 'Widest shape shown uncropped. Good for panoramas.',
  },
]

export const X_IMAGES_PER_POST = 4
export const MAX_SLIDES = 20

export type Direction = 'vertical' | 'horizontal'

export interface CarouselOptions {
  format: FramePreset
  direction: Direction
  // Number of slides, or 'auto' to fill the slide width and use as many as needed
  count: number | 'auto'
  margin: number
  smartCuts: boolean
}

export interface Slice {
  start: number
  end: number
}

export interface CarouselPlan {
  direction: Direction
  slices: Slice[]
  // Output pixels per source pixel
  scale: number
  // Content is centered along the split when the slide count is fixed, top/left aligned otherwise
  center: boolean
}

// How busy each line (row or column) across the split direction is, in a downscaled copy.
// Text and edges score high; blank gaps between lines of text score near zero.
export interface LineEnergy {
  values: Float32Array
  // Analysis pixels per source pixel
  factor: number
}

export function measureLineEnergy(image: ImageBitmap, direction: Direction): LineEnergy {
  const along = direction === 'vertical' ? image.height : image.width
  const across = direction === 'vertical' ? image.width : image.height
  let factor = Math.min(1, 360 / across)
  factor = Math.min(factor, 16000 / along)
  const aAcross = Math.max(1, Math.round(across * factor))
  const aAlong = Math.max(1, Math.round(along * factor))
  const w = direction === 'vertical' ? aAcross : aAlong
  const h = direction === 'vertical' ? aAlong : aAcross
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(image, 0, 0, w, h)
  const px = ctx.getImageData(0, 0, w, h).data
  const lum = (x: number, y: number) => {
    const i = (y * w + x) * 4
    return px[i]! * 0.3 + px[i + 1]! * 0.59 + px[i + 2]! * 0.11
  }
  const values = new Float32Array(aAlong)
  for (let a = 0; a < aAlong; a++) {
    let sum = 0
    for (let c = 1; c < aAcross; c++) {
      sum +=
        direction === 'vertical'
          ? Math.abs(lum(c, a) - lum(c - 1, a))
          : Math.abs(lum(a, c) - lum(a, c - 1))
    }
    values[a] = sum / aAcross
  }
  return { values, factor }
}

// Finds the quietest line in [min, max] (source pixels), preferring later cuts so slides
// stay as full as possible
function bestCut(energy: LineEnergy, min: number, max: number): number {
  const { values, factor } = energy
  const lo = Math.max(1, Math.floor(min * factor))
  const hi = Math.min(values.length - 2, Math.floor(max * factor))
  if (hi <= lo) return max
  let mean = 0
  for (let i = lo; i <= hi; i++) mean += values[i]!
  mean /= hi - lo + 1
  let best = hi
  let bestScore = Infinity
  for (let i = hi; i >= lo; i--) {
    // A line plus its neighbours, so the cut lands in the middle of a gap
    const local = values[i - 1]! + 2 * values[i]! + values[i + 1]!
    const score = local / 4 + 0.15 * mean * ((hi - i) / (hi - lo))
    if (score < bestScore) {
      bestScore = score
      best = i
    }
  }
  // Convert back to source pixels, never past the allowed maximum
  return Math.min(max, (best + 1) / factor)
}

const SEARCH = 0.18

export function planCarousel(
  srcW: number,
  srcH: number,
  opts: CarouselOptions,
  energy: LineEnergy | null,
): CarouselPlan {
  const vertical = opts.direction === 'vertical'
  const along = vertical ? srcH : srcW
  const across = vertical ? srcW : srcH
  const W = opts.format.width
  const H = opts.format.height
  const innerAlong = Math.max(1, (vertical ? H : W) - 2 * opts.margin)
  const innerAcross = Math.max(1, (vertical ? W : H) - 2 * opts.margin)
  const smart = opts.smartCuts && energy !== null

  if (opts.count === 'auto') {
    const scale = innerAcross / across
    const capacity = innerAlong / scale
    const slices: Slice[] = []
    let pos = 0
    while (along - pos > capacity + 0.5 && slices.length < MAX_SLIDES - 1) {
      const cut = smart
        ? bestCut(energy, pos + capacity * (1 - SEARCH), pos + capacity)
        : pos + capacity
      slices.push({ start: pos, end: cut })
      pos = cut
    }
    slices.push({ start: pos, end: along })
    // Very long images: shrink everything so the slides still cover the whole image
    const last = slices[slices.length - 1]!
    if (last.end - last.start > capacity + 0.5) {
      return planCarousel(srcW, srcH, { ...opts, count: MAX_SLIDES }, energy)
    }
    return { direction: opts.direction, slices, scale, center: false }
  }

  const n = Math.max(1, Math.min(MAX_SLIDES, Math.round(opts.count)))
  const scale = Math.min(innerAcross / across, (n * innerAlong) / along)
  const capacity = innerAlong / scale
  const piece = along / n
  const slices: Slice[] = []
  let pos = 0
  for (let k = 1; k < n; k++) {
    const ideal = k * piece
    // Each slide must fit, and the rest must still fit in the remaining slides
    const min = Math.max(pos + 1, along - (n - k) * capacity, ideal - piece * SEARCH)
    const max = Math.min(pos + capacity, ideal + piece * SEARCH)
    const cut = smart && max > min ? bestCut(energy, min, max) : Math.min(ideal, pos + capacity)
    slices.push({ start: pos, end: cut })
    pos = cut
  }
  slices.push({ start: pos, end: along })
  return { direction: opts.direction, slices, scale, center: true }
}

// Average color of the image border, used to fill around the slices
export function edgeColor(image: ImageBitmap): string {
  const size = 64
  const canvas = new OffscreenCanvas(size, size)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(image, 0, 0, size, size)
  const px = ctx.getImageData(0, 0, size, size).data
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x > 1 && x < size - 2 && y > 1 && y < size - 2) continue
      const i = (y * size + x) * 4
      r += px[i]!
      g += px[i + 1]!
      b += px[i + 2]!
      n++
    }
  }
  const hex = (v: number) =>
    Math.round(v / n)
      .toString(16)
      .padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

export interface SlideStyle {
  background: string
  numbers: boolean
  margin: number
}

// Draws slide `index` at `k` device pixels per output pixel
export function renderSlide(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  image: ImageBitmap,
  plan: CarouselPlan,
  format: FramePreset,
  index: number,
  style: SlideStyle,
  k = 1,
): void {
  const W = format.width * k
  const H = format.height * k
  const slice = plan.slices[index]
  if (!slice) return
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = style.background
  ctx.fillRect(0, 0, W, H)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const s = plan.scale * k
  const m = style.margin * k
  const length = slice.end - slice.start
  if (plan.direction === 'vertical') {
    const dw = image.width * s
    const dh = length * s
    const dy = plan.center ? (H - dh) / 2 : m
    ctx.drawImage(image, 0, slice.start, image.width, length, (W - dw) / 2, dy, dw, dh)
  } else {
    const dw = length * s
    const dh = image.height * s
    const dx = plan.center ? (W - dw) / 2 : m
    ctx.drawImage(image, slice.start, 0, length, image.height, dx, (H - dh) / 2, dw, dh)
  }

  if (style.numbers && plan.slices.length > 1) {
    const label = `${index + 1}/${plan.slices.length}`
    const font = Math.round(Math.min(W, H) * 0.032)
    ctx.font = `600 ${font}px ui-sans-serif, system-ui, -apple-system, sans-serif`
    const padX = font * 0.7
    const boxW = ctx.measureText(label).width + padX * 2
    const boxH = font * 1.8
    const x = W - boxW - font
    const y = font
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
    ctx.beginPath()
    ctx.roundRect(x, y, boxW, boxH, boxH / 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x + padX, y + boxH / 2 + font * 0.05)
  }
  ctx.restore()
}

export async function slideBlob(
  image: ImageBitmap,
  plan: CarouselPlan,
  format: FramePreset,
  index: number,
  style: SlideStyle,
  type: 'image/png' | 'image/jpeg' = 'image/png',
): Promise<Blob> {
  const canvas = new OffscreenCanvas(format.width, format.height)
  renderSlide(canvas.getContext('2d')!, image, plan, format, index, style)
  return canvas.convertToBlob({ type, quality: 0.92 })
}
