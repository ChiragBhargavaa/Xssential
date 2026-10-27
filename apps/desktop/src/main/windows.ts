import { join } from 'node:path'
import { app, BrowserWindow, screen, type BrowserWindowConstructorOptions } from 'electron'
import { is } from '@electron-toolkit/utils'

export type Route = 'home' | 'setup' | 'wheel' | 'capture' | 'image' | 'video' | 'carousel'

const preload = join(__dirname, '../preload/index.js')
const isMac = process.platform === 'darwin'

export function loadRoute(win: BrowserWindow, route: Route, query = ''): void {
  const hash = `/${route}${query ? `?${query}` : ''}`
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${hash}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  }
}

// The app lives in the menu bar. On macOS the dock icon only appears while a regular
// window (home or an editor) is open, so those windows can be reached with Cmd+Tab.
const appWindows = new Set<BrowserWindow>()

function trackAppWindow(win: BrowserWindow) {
  appWindows.add(win)
  if (isMac) app.dock?.show()
  win.on('closed', () => {
    appWindows.delete(win)
    if (isMac && appWindows.size === 0) app.dock?.hide()
  })
}

export function hasVisibleAppWindows(): boolean {
  return [...appWindows].some((w) => !w.isDestroyed() && w.isVisible())
}

export function allAppWindows(): BrowserWindow[] {
  return [...appWindows].filter((w) => !w.isDestroyed())
}

interface AppWindowOptions {
  route: Route
  query?: string
  width: number
  height: number
  minWidth?: number
  minHeight?: number
  title: string
  backgroundThrottling?: boolean
}

export function createAppWindow(opts: AppWindowOptions): BrowserWindow {
  // Open on the display the user is working on
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const { workArea } = display
  const width = Math.min(opts.width, workArea.width - 40)
  const height = Math.min(opts.height, workArea.height - 40)

  const win = new BrowserWindow({
    width,
    height,
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    minWidth: opts.minWidth,
    minHeight: opts.minHeight,
    title: opts.title,
    show: false,
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    webPreferences: {
      preload,
      sandbox: true,
      contextIsolation: true,
      backgroundThrottling: opts.backgroundThrottling ?? true,
    },
  })
  trackAppWindow(win)
  win.once('ready-to-show', () => {
    win.show()
    win.focus()
  })
  loadRoute(win, opts.route, opts.query)
  return win
}

export function overlayWindowOptions(
  extra: BrowserWindowConstructorOptions,
): BrowserWindowConstructorOptions {
  return {
    frame: false,
    show: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: { preload, sandbox: true, contextIsolation: true },
    ...extra,
  }
}
