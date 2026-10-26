import { nativeImage, type NativeImage } from 'electron'

// Tray icons are drawn from signed distance functions instead of shipping image files,
// so every scale factor gets crisp pixels.

type Rgba = [number, number, number, number]
type Shader = (x: number, y: number) => Rgba

const SUPERSAMPLE = 4

function roundedBoxDistance(x: number, y: number, cx: number, cy: number, half: number, r: number) {
  const qx = Math.abs(x - cx) - half + r
  const qy = Math.abs(y - cy) - half + r
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
  return outside + Math.min(Math.max(qx, qy), 0) - r
}

function segmentDistance(x: number, y: number, ax: number, ay: number, bx: number, by: number) {
  const px = x - ax
  const py = y - ay
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - dx * t, py - dy * t)
}

// Distance to the "X" glyph used by the app icon, in a 16pt box
function crossDistance(x: number, y: number) {
  const a = 5.2
  const b = 10.8
  return Math.min(segmentDistance(x, y, a, a, b, b), segmentDistance(x, y, b, a, a, b)) - 0.95
}

function render(sizePt: number, scale: number, shader: Shader): Buffer {
  const size = Math.round(sizePt * scale)
  const buf = Buffer.alloc(size * size * 4)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const x = (px + (sx + 0.5) / SUPERSAMPLE) / scale
          const y = (py + (sy + 0.5) / SUPERSAMPLE) / scale
          const [cr, cg, cb, ca] = shader(x, y)
          r += cr * ca
          g += cg * ca
          b += cb * ca
          a += ca
        }
      }
      const n = SUPERSAMPLE * SUPERSAMPLE
      const i = (py * size + px) * 4
      // Premultiplied BGRA, the layout NativeImage bitmaps use
      buf[i] = Math.round(b / n)
      buf[i + 1] = Math.round(g / n)
      buf[i + 2] = Math.round(r / n)
      buf[i + 3] = Math.round((a / n) * 255)
    }
  }
  return buf
}

function build(sizePt: number, shader: Shader, template = false): NativeImage {
  const image = nativeImage.createEmpty()
  for (const scale of [1, 2]) {
    const size = Math.round(sizePt * scale)
    image.addRepresentation({
      scaleFactor: scale,
      width: size,
      height: size,
      buffer: render(sizePt, scale, shader),
    })
  }
  if (template) image.setTemplateImage(true)
  return image
}

const coverage = (distance: number) => (distance <= 0 ? 1 : 0)

// macOS menu bar: a filled rounded square with the X knocked out. Template images are
// recolored by the system for light and dark menu bars.
export function trayTemplateIcon(): NativeImage {
  return build(
    16,
    (x, y) => {
      const box = coverage(roundedBoxDistance(x, y, 8, 8, 6.75, 3.4))
      const cross = coverage(crossDistance(x, y))
      return [0, 0, 0, box * (1 - cross)]
    },
    true,
  )
}

// Windows notification area: the colored app icon
export function trayColorIcon(): NativeImage {
  return build(16, (x, y) => {
    if (coverage(roundedBoxDistance(x, y, 8, 8, 7.5, 3.6)) === 0) return [0, 0, 0, 0]
    if (coverage(crossDistance(x, y))) return [255, 255, 255, 1]
    const t = y / 16
    return [Math.round(99 + (137 - 99) * t), Math.round(102 + (47 - 102) * t), 241 - 30 * t, 1]
  })
}

// Shown in the tray while a recording is running
export function trayRecordingIcon(): NativeImage {
  return build(16, (x, y) => {
    const d = Math.hypot(x - 8, y - 8)
    if (d <= 4.25) return [239, 68, 68, 1]
    if (d <= 6.25) return [239, 68, 68, 0.3]
    return [0, 0, 0, 0]
  })
}
