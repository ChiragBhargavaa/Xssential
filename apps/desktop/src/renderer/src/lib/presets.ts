import type { Background, Composition, FramePreset } from './composition'

// Canvas sizes for screenshots on X. A 16:9 image looks the same on the web and on phones;
// a 4:5 one shows in full on phones and takes up more of the timeline. Up to 4 images of
// 5 MB each per post (X's media best practices, docs.x.com).
export const IMAGE_FRAMES: FramePreset[] = [
  {
    id: 'x-landscape',
    label: 'Landscape',
    ratio: '16:9',
    width: 1600,
    height: 900,
    note: 'Looks the same on the web and on phones.',
  },
  {
    id: 'x-portrait',
    label: 'Portrait',
    ratio: '4:5',
    width: 1080,
    height: 1350,
    note: 'Shows in full on phones and takes up more of the timeline.',
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

export interface Photo {
  id: string
  author: string
  url: string
  // Small copy shown in the picker
  thumb: string
}

// Abstract backgrounds from Unsplash, free to use under the Unsplash License. The
// photographers are thanked in README.md.
const photoUrls = import.meta.glob<string>('../assets/backgrounds/*.webp', {
  eager: true,
  import: 'default',
})
const thumbUrls = import.meta.glob<string>('../assets/backgrounds/thumbs/*.webp', {
  eager: true,
  import: 'default',
})

const photo = (id: string, author: string): Photo => ({
  id,
  author,
  url: photoUrls[`../assets/backgrounds/${id}.webp`]!,
  thumb: thumbUrls[`../assets/backgrounds/thumbs/${id}.webp`]!,
})

export const PHOTOS: Photo[] = [
  photo('blush', 'Allison Saeng'),
  photo('violet', 'Mohammed Kara'),
  photo('indigo', 'MagicPattern'),
  photo('aurora', 'Milad Fakurian'),
  photo('prism', 'Codioful'),
  photo('crimson', 'MagicPattern'),
  photo('ember', 'Antonius Harel'),
  photo('rust', 'Josiah Rock'),
  photo('silk', 'Universtock'),
  photo('dusk', 'Mohammad Alizade'),
  photo('forest', 'Kunal Patil'),
  photo('lagoon', 'Ikhlas'),
  photo('glacier', 'Zaky Jundana'),
]

// Built-in photos are remembered by id, since their URLs change between builds
export function photoBackground(id: string | undefined): Background | null {
  const p = PHOTOS.find((p) => p.id === id)
  return p ? { kind: 'image', url: p.url, photo: p.id } : null
}

export const DEFAULT_BACKGROUND = photoBackground('prism')!

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
