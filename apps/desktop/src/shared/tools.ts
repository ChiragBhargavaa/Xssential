// Tools shown in the wheel, the tray menu and the home window, in wheel order (clockwise from the top)
export const TOOLS = [
  { id: 'screenshot', label: 'Screenshot', hint: 'Capture an area of the screen' },
  { id: 'record', label: 'Record', hint: 'Record the screen as a video' },
  { id: 'edit-video', label: 'Edit video', hint: 'Blur, trim and add music to your own video' },
  { id: 'settings', label: 'Settings', hint: 'Shortcut and permissions' },
  { id: 'carousel', label: 'Carousel', hint: 'Split a long image into an X carousel' },
  { id: 'edit-image', label: 'Edit image', hint: 'Style an image you already have' },
] as const

export type ToolId = (typeof TOOLS)[number]['id']

export const DEFAULT_SHORTCUT = 'Alt+Shift+X'

export interface Settings {
  shortcut: string
  launchAtLogin: boolean
  onboarded: boolean
  // A tool to reopen after Xssential restarts for the screen recording permission
  resume: { tool: ToolId; at: number } | null
  // The X username last signed in with, shown next to "Post on X"
  xHandle: string | null
}

export interface XAccount {
  signedIn: boolean
  handle: string | null
}

export interface AppInfo {
  version: string
  // False for development builds, where macOS ties permissions to the terminal
  packaged: boolean
}

export type ScreenAccess = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'

export interface CaptureFrame {
  width: number
  height: number
  // Raw BGRA pixels as returned by NativeImage.toBitmap()
  data: Uint8Array
}

export interface CaptureSource {
  id: string
  name: string
  kind: 'screen' | 'window'
  thumbnail: string
  icon: string | null
}

export interface MusicTrack {
  id: string
  title: string
  creator: string
  url: string
  duration: number | null
  license: string
  licenseVersion: string
  licenseUrl: string
  landingUrl: string
  attribution: string
  source: string
}

export interface ImageFilter {
  name: string
  extensions: string[]
}
