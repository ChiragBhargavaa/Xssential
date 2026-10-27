// The compositor shared by the screenshot and video editors. A composition describes how a
// source image or video frame is cropped, redacted and placed on a styled canvas. All sizes
// are in output pixels unless noted otherwise.

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Redaction {
  id: string
  // In source pixels, so it stays put when the crop changes
  rect: Rect
  strength: number
  // Optional time range in seconds (video only); the whole clip when unset
  start?: number
  end?: number
}

// Pushes a background image back so the screenshot stays in front. Each goes from 0 to 100.
export interface ImageEffects {
  blur: number
  glass: number
  grain: number
}

export type Background =
  | { kind: 'none' }
  | { kind: 'solid'; color: string }
  // `photo` is the id of a built-in photo; without it the image is the user's own
  | { kind: 'image'; url: string; photo?: string; effects?: ImageEffects }

export interface Composition {
  crop: Rect | null
  redactions: Redaction[]
  frame: string
  padding: number
  radius: number
  shadow: number
  background: Background
}

export interface FramePreset {
  id: string
  label: string
  ratio: string
  // 0 × 0 means the canvas follows the content
  width: number
  height: number
  note: string
}

export interface Layout {
  width: number
  height: number
  // Where the cropped source lands on the canvas
  content: Rect
  // Output pixels per source pixel
  scale: number
  crop: Rect
  sourceWidth: number
  sourceHeight: number
}

export interface LayoutLimits {
  // Upper bounds for "auto" canvases, e.g. so videos stay within X's 1080p limit
  maxLong?: number
  maxShort?: number
  // Video encoders need even dimensions
  even?: boolean
}

export const fullRect = (w: number, h: number): Rect => ({ x: 0, y: 0, w, h })

export function clampRect(r: Rect, w: number, h: number): Rect {
  const x = Math.max(0, Math.min(r.x, w - 1))
  const y = Math.max(0, Math.min(r.y, h - 1))
  return {
    x,
    y,
    w: Math.max(1, Math.min(r.w, w - x)),
    h: Math.max(1, Math.min(r.h, h - y)),
  }
}

export function computeLayout(
  comp: Composition,
  srcW: number,
  srcH: number,
  frames: FramePreset[],
  limits: LayoutLimits = {},
): Layout {
  const crop = clampRect(comp.crop ?? fullRect(srcW, srcH), srcW, srcH)
  const frame = frames.find((f) => f.id === comp.frame)
  const pad = Math.max(0, comp.padding)
  let width: number
  let height: number
  let scale: number

  if (!frame || frame.width === 0) {
    scale = 1
    const long = Math.max(crop.w, crop.h)
    const short = Math.min(crop.w, crop.h)
    if (limits.maxLong) scale = Math.min(scale, Math.max(1, limits.maxLong - 2 * pad) / long)
    if (limits.maxShort) scale = Math.min(scale, Math.max(1, limits.maxShort - 2 * pad) / short)
    width = crop.w * scale + 2 * pad
    height = crop.h * scale + 2 * pad
  } else {
    width = frame.width
    height = frame.height
    const availW = Math.max(1, width - 2 * pad)
    const availH = Math.max(1, height - 2 * pad)
    scale = Math.min(availW / crop.w, availH / crop.h)
  }

  width = Math.max(2, Math.round(width))
  height = Math.max(2, Math.round(height))
  if (limits.even) {
    width = Math.round(width / 2) * 2
    height = Math.round(height / 2) * 2
  }
  const cw = crop.w * scale
  const ch = crop.h * scale
  return {
    width,
    height,
    content: { x: (width - cw) / 2, y: (height - ch) / 2, w: cw, h: ch },
    scale,
    crop,
    sourceWidth: srcW,
    sourceHeight: srcH,
  }
}

// Maps a rectangle in source pixels to output pixels
export function sourceToOutput(r: Rect, layout: Layout): Rect {
  return {
    x: layout.content.x + (r.x - layout.crop.x) * layout.scale,
    y: layout.content.y + (r.y - layout.crop.y) * layout.scale,
    w: r.w * layout.scale,
    h: r.h * layout.scale,
  }
}

export function outputToSource(r: Rect, layout: Layout): Rect {
  return {
    x: layout.crop.x + (r.x - layout.content.x) / layout.scale,
    y: layout.crop.y + (r.y - layout.content.y) / layout.scale,
    w: r.w / layout.scale,
    h: r.h / layout.scale,
  }
}

export const isRedactionActive = (r: Redaction, time: number | undefined): boolean =>
  time === undefined || ((r.start ?? -Infinity) <= time && time < (r.end ?? Infinity))

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export interface RenderOptions {
  // Device pixels per output pixel; below 1 for previews
  scale?: number
  // Current time in seconds, for redactions limited to part of a video
  time?: number
  backgroundImage?: CanvasImageSource | null
  // Fill used when the background is transparent but the output can't be (JPEG, video)
  opaque?: string
}

let scratch: OffscreenCanvas | null = null
function scratchContext(w: number, h: number) {
  if (!scratch) scratch = new OffscreenCanvas(w, h)
  if (scratch.width < w) scratch.width = w
  if (scratch.height < h) scratch.height = h
  const ctx = scratch.getContext('2d')!
  ctx.clearRect(0, 0, w, h)
  return { canvas: scratch, ctx }
}

function roundRectPath(ctx: Ctx, r: Rect, radius: number) {
  ctx.beginPath()
  ctx.roundRect(r.x, r.y, r.w, r.h, Math.max(0, Math.min(radius, r.w / 2, r.h / 2)))
}

function drawCover(ctx: Ctx, image: CanvasImageSource, r: Rect) {
  const iw = (image as { width: number }).width
  const ih = (image as { height: number }).height
  if (!iw || !ih) return
  const s = Math.max(r.w / iw, r.h / ih)
  ctx.drawImage(image, r.x + (r.w - iw * s) / 2, r.y + (r.h - ih * s) / 2, iw * s, ih * s)
}

let noiseTile: OffscreenCanvas | null = null
function noise(): OffscreenCanvas {
  if (noiseTile) return noiseTile
  const size = 256
  noiseTile = new OffscreenCanvas(size, size)
  const ctx = noiseTile.getContext('2d')!
  const pixels = ctx.createImageData(size, size)
  // A fixed seed keeps the grain the same in previews and exports
  let seed = 1
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let i = 0; i < pixels.data.length; i += 4) {
    const v = 128 + (random() + random() - 1) * 127
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = v
    pixels.data[i + 3] = 255
  }
  ctx.putImageData(pixels, 0, 0)
  return noiseTile
}

// `size` is the width of one speck in canvas pixels
function fillNoise(
  ctx: Ctx,
  w: number,
  h: number,
  size: number,
  blend: GlobalCompositeOperation,
  alpha: number,
) {
  const pattern = ctx.createPattern(noise(), 'repeat')!
  pattern.setTransform(new DOMMatrix().scale(size))
  ctx.save()
  ctx.globalCompositeOperation = blend
  ctx.globalAlpha = alpha
  ctx.fillStyle = pattern
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
}

const hasEffects = (fx: ImageEffects | undefined): fx is ImageEffects =>
  !!fx && (fx.blur > 0 || fx.glass > 0 || fx.grain > 0)

// The finished background is kept per image and size, so video frames and redraws don't
// blur it again
const effectsCache = new WeakMap<object, { key: string; canvas: OffscreenCanvas }[]>()

function withEffects(image: CanvasImageSource, fx: ImageEffects, w: number, h: number) {
  const width = Math.max(1, Math.ceil(w))
  const height = Math.max(1, Math.ceil(h))
  const key = `${width}x${height} ${fx.blur} ${fx.glass} ${fx.grain}`
  const cached = effectsCache.get(image) ?? []
  const hit = cached.find((c) => c.key === key)
  if (hit) return hit.canvas

  // Sizes are relative to the canvas so previews and exports look the same
  const unit = Math.max(width, height) / 100
  const glass = fx.glass / 100
  const grain = fx.grain / 100
  // Frosted glass scatters light, so it softens the image a little on its own
  const radius = unit * ((fx.blur / 100) * 5 + glass * 1.5)
  const filters = [radius > 0 && `blur(${radius}px)`, glass > 0 && `saturate(${1 + 0.4 * glass})`]
  // A blur fades out toward the edges of whatever it is drawn on, so it is drawn on a
  // larger canvas and only the middle is kept
  const m = Math.ceil(radius * 3)
  const soft = new OffscreenCanvas(width + 2 * m, height + 2 * m)
  const softCtx = soft.getContext('2d')!
  softCtx.filter = filters.filter(Boolean).join(' ') || 'none'
  drawCover(softCtx, image, fullRect(soft.width, soft.height))

  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(soft, m, m, width, height, 0, 0, width, height)

  if (glass > 0) {
    // A milky pane with light catching the top corner, and a fine frosted texture
    ctx.fillStyle = `rgba(255, 255, 255, ${0.22 * glass})`
    ctx.fillRect(0, 0, width, height)
    const sheen = ctx.createLinearGradient(0, 0, width, height)
    sheen.addColorStop(0, `rgba(255, 255, 255, ${0.3 * glass})`)
    sheen.addColorStop(0.45, 'rgba(255, 255, 255, 0)')
    sheen.addColorStop(1, `rgba(255, 255, 255, ${0.1 * glass})`)
    ctx.fillStyle = sheen
    ctx.fillRect(0, 0, width, height)
    fillNoise(ctx, width, height, unit / 16, 'soft-light', 0.5 * glass)
  }
  if (grain > 0) fillNoise(ctx, width, height, unit / 8, 'overlay', 0.6 * grain)

  // Two sizes cover the preview and an export running next to it
  effectsCache.set(image, [{ key, canvas }, ...cached].slice(0, 2))
  return canvas
}

export function drawBackground(
  ctx: Ctx,
  bg: Background,
  w: number,
  h: number,
  image?: CanvasImageSource | null,
  opaque?: string,
): void {
  if (opaque) {
    ctx.fillStyle = opaque
    ctx.fillRect(0, 0, w, h)
  }
  if (bg.kind === 'solid') {
    ctx.fillStyle = bg.color
    ctx.fillRect(0, 0, w, h)
  } else if (bg.kind === 'image' && image) {
    if (hasEffects(bg.effects)) ctx.drawImage(withEffects(image, bg.effects, w, h), 0, 0)
    else drawCover(ctx, image, fullRect(w, h))
  }
}

function drawRedaction(
  ctx: Ctx,
  source: CanvasImageSource,
  redaction: Redaction,
  layout: Layout,
  k: number,
) {
  const { crop, content } = layout
  // Clip the redaction to the visible part of the source
  const sx0 = Math.max(redaction.rect.x, crop.x)
  const sy0 = Math.max(redaction.rect.y, crop.y)
  const sx1 = Math.min(redaction.rect.x + redaction.rect.w, crop.x + crop.w)
  const sy1 = Math.min(redaction.rect.y + redaction.rect.h, crop.y + crop.h)
  if (sx1 - sx0 < 1 || sy1 - sy0 < 1) return
  const sw = sx1 - sx0
  const sh = sy1 - sy0
  const dest = sourceToOutput({ x: sx0, y: sy0, w: sw, h: sh }, layout)
  const dx = dest.x * k
  const dy = dest.y * k
  const dw = dest.w * k
  const dh = dest.h * k

  // Strength is relative to the image size so previews and exports look the same
  const unit = (Math.max(content.w, content.h) / 100) * k
  const strength = Math.max(1, redaction.strength)

  const radius = Math.max(1, (unit * strength) / 25)
  ctx.save()
  ctx.beginPath()
  ctx.rect(dx, dy, dw, dh)
  ctx.clip()
  // A heavily downscaled copy goes underneath, so the blur's soft edges never reveal
  // the original pixels
  const cols = Math.max(1, Math.round(dw / (radius * 1.5)))
  const rows = Math.max(1, Math.round(dh / (radius * 1.5)))
  const tmp = scratchContext(cols, rows)
  tmp.ctx.drawImage(source, sx0, sy0, sw, sh, 0, 0, cols, rows)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(tmp.canvas, 0, 0, cols, rows, dx, dy, dw, dh)
  // Then the real blur, drawn with a margin so its edges fall outside the clip
  const margin = (radius * 2) / (layout.scale * k)
  const mx0 = Math.max(0, sx0 - margin)
  const my0 = Math.max(0, sy0 - margin)
  const mx1 = Math.min(layout.sourceWidth, sx1 + margin)
  const my1 = Math.min(layout.sourceHeight, sy1 + margin)
  const outer = sourceToOutput({ x: mx0, y: my0, w: mx1 - mx0, h: my1 - my0 }, layout)
  ctx.filter = `blur(${radius}px)`
  ctx.drawImage(
    source,
    mx0,
    my0,
    mx1 - mx0,
    my1 - my0,
    outer.x * k,
    outer.y * k,
    outer.w * k,
    outer.h * k,
  )
  ctx.restore()
}

// Draws the full composition. The canvas must be at least layout size × scale.
export function renderComposite(
  ctx: Ctx,
  source: CanvasImageSource,
  layout: Layout,
  comp: Composition,
  opts: RenderOptions = {},
): void {
  const k = opts.scale ?? 1
  const w = layout.width * k
  const h = layout.height * k
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.filter = 'none'
  ctx.clearRect(0, 0, w, h)
  drawBackground(ctx, comp.background, w, h, opts.backgroundImage, opts.opaque)

  const content: Rect = {
    x: layout.content.x * k,
    y: layout.content.y * k,
    w: layout.content.w * k,
    h: layout.content.h * k,
  }
  const radius = comp.radius * k

  // Drop shadow, sized relative to the canvas. The shape is drawn far off-canvas and only
  // its shadow is offset back into view, so transparent images don't get a dark fill.
  if (comp.shadow > 0) {
    const t = comp.shadow / 100
    const unit = (Math.max(layout.width, layout.height) / 1600) * k
    const away = w + h + 1000
    ctx.save()
    ctx.shadowColor = `rgba(0, 0, 0, ${0.18 + 0.4 * t})`
    ctx.shadowBlur = 90 * t * unit
    ctx.shadowOffsetX = away
    ctx.shadowOffsetY = 28 * t * unit
    ctx.fillStyle = '#000'
    roundRectPath(ctx, { ...content, x: content.x - away }, radius)
    ctx.fill()
    ctx.restore()
  }

  ctx.save()
  roundRectPath(ctx, content, radius)
  ctx.clip()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  const { crop } = layout
  ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, content.x, content.y, content.w, content.h)
  for (const redaction of comp.redactions) {
    if (isRedactionActive(redaction, opts.time)) drawRedaction(ctx, source, redaction, layout, k)
  }
  ctx.restore()
  ctx.restore()
}

export async function renderToBlob(
  source: CanvasImageSource,
  layout: Layout,
  comp: Composition,
  format: 'png' | 'jpeg',
  backgroundImage?: CanvasImageSource | null,
): Promise<Blob> {
  const canvas = new OffscreenCanvas(layout.width, layout.height)
  const ctx = canvas.getContext('2d')!
  renderComposite(ctx, source, layout, comp, {
    backgroundImage,
    opaque: format === 'jpeg' ? '#ffffff' : undefined,
  })
  return canvas.convertToBlob({ type: `image/${format}`, quality: 0.92 })
}
