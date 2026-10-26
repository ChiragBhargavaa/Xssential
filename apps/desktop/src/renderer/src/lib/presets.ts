import type { Background, Composition, FramePreset } from './composition'

// Canvas sizes for X posts. Sources: X's media best practices (docs.x.com: up to 4 images
// of 5 MB each per post; video 1:3–3:1, 30/60 fps, H.264 High + AAC) and X's 2021 change
// that shows single 3:4 to 2:1 images uncropped in the timeline.
export const IMAGE_FRAMES: FramePreset[] = [
  {
    id: 'auto',
    label: 'Auto',
    ratio: 'Fit',
    width: 0,
    height: 0,
    note: 'Canvas follows the image.',
  },
  {
    id: 'x-landscape',
    label: 'Landscape',
    ratio: '16:9',
    width: 1600,
    height: 900,
    note: 'The classic single-image post. Shows uncropped everywhere.',
  },
  {
    id: 'x-square',
    label: 'Square',
    ratio: '1:1',
    width: 1200,
    height: 1200,
    note: 'Safe for single and multi-image posts.',
  },
  {
    id: 'x-portrait',
    label: 'Portrait',
    ratio: '4:5',
    width: 1080,
    height: 1350,
    note: 'Fills more of the mobile timeline.',
  },
  {
    id: 'x-tall',
    label: 'Tall',
    ratio: '3:4',
    width: 1080,
    height: 1440,
    note: 'Tallest shape X shows in full.',
  },
  {
    id: 'x-wide',
    label: 'Wide',
    ratio: '2:1',
    width: 1600,
    height: 800,
    note: 'Widest shape X shows in full on mobile.',
  },
  {
    id: 'x-header',
    label: 'Header',
    ratio: '3:1',
    width: 1500,
    height: 500,
    note: 'Profile header image.',
  },
]

export const VIDEO_FRAMES: FramePreset[] = [
  {
    id: 'auto',
    label: 'Original',
    ratio: 'Fit',
    width: 0,
    height: 0,
    note: 'Keeps the recording shape, scaled to fit 1920 × 1200.',
  },
  {
    id: 'video-landscape',
    label: 'Landscape',
    ratio: '16:9',
    width: 1920,
    height: 1080,
    note: "X's recommended shape for video.",
  },
  {
    id: 'video-square',
    label: 'Square',
    ratio: '1:1',
    width: 1080,
    height: 1080,
    note: 'Takes the same space on every screen.',
  },
  {
    id: 'video-portrait',
    label: 'Portrait',
    ratio: '4:5',
    width: 1080,
    height: 1350,
    note: 'Fills more of the mobile timeline.',
  },
  {
    id: 'video-vertical',
    label: 'Vertical',
    ratio: '9:16',
    width: 1080,
    height: 1920,
    note: 'Full-screen on phones.',
  },
]

// X keeps 1080p for subscribers; this keeps "Original" exports inside that
export const VIDEO_LIMITS = { maxLong: 1920, maxShort: 1200, even: true }

export interface Gradient {
  id: string
  stops: string[]
  angle: number
}

// Built from X's accent colors (blue, purple, pink, orange, yellow, green) and its dark themes
export const GRADIENTS: Gradient[] = [
  { id: 'x-blue', stops: ['#1d9bf0', '#0b5ea8'], angle: 135 },
  { id: 'x-twilight', stops: ['#1d9bf0', '#7856ff'], angle: 135 },
  { id: 'x-purple', stops: ['#7856ff', '#f91880'], angle: 135 },
  { id: 'x-sunset', stops: ['#ff7a00', '#f91880'], angle: 135 },
  { id: 'x-gold', stops: ['#ffd400', '#ff7a00'], angle: 135 },
  { id: 'x-mint', stops: ['#00ba7c', '#1d9bf0'], angle: 135 },
  { id: 'x-dim', stops: ['#15202b', '#273340'], angle: 160 },
  { id: 'x-night', stops: ['#16181c', '#000000'], angle: 160 },
  { id: 'x-ink', stops: ['#000000', '#1d9bf0'], angle: 160 },
  { id: 'x-light', stops: ['#ffffff', '#e8f5fd'], angle: 160 },
]

export const SOLIDS = [
  '#ffffff',
  '#f7f9f9',
  '#000000',
  // X's Dim background
  '#15202b',
  '#1d9bf0',
  '#7856ff',
  '#f91880',
  '#ff7a00',
  '#00ba7c',
]

const defaultGradient = GRADIENTS[0]!

export const DEFAULT_BACKGROUND: Background = {
  kind: 'gradient',
  stops: defaultGradient.stops,
  angle: defaultGradient.angle,
}

export const defaultComposition = (frame = 'auto'): Composition => ({
  crop: null,
  redactions: [],
  frame,
  padding: 64,
  radius: 16,
  shadow: 40,
  background: DEFAULT_BACKGROUND,
})

// Size limit for a single image on X
export const X_IMAGE_LIMIT = 5 * 1024 * 1024
