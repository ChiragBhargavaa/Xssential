import { BrowserWindow, desktopCapturer, dialog, ipcMain, screen } from 'electron'
import type { CaptureFrame } from '../shared/tools'
import { loadRoute, overlayWindowOptions } from './windows'

let overlay: BrowserWindow | null = null
let frame: CaptureFrame | null = null

function closeOverlay() {
  frame = null
  if (overlay && !overlay.isDestroyed()) overlay.close()
  overlay = null
}

// Freezes the display under the cursor and lets the user drag out the area to keep.
// Callers check the screen recording permission first.
export async function startCapture(): Promise<void> {
  if (overlay) return

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const { bounds, scaleFactor } = display
  let sources: Electron.DesktopCapturerSource[]
  try {
    sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(bounds.width * scaleFactor),
        height: Math.round(bounds.height * scaleFactor),
      },
    })
  } catch (err) {
    console.error('Screen capture failed', err)
    dialog.showErrorBox('Screenshot failed', String(err))
    return
  }
  const source =
    sources.find((s) => s.display_id === String(display.id)) ??
    (sources.length === 1 ? sources[0] : undefined)
  if (!source || source.thumbnail.isEmpty()) {
    dialog.showErrorBox(
      'Screenshot failed',
      'Could not capture the screen. Check that Xssential is allowed to record the screen.',
    )
    return
  }

  const size = source.thumbnail.getSize()
  frame = { width: size.width, height: size.height, data: source.thumbnail.toBitmap() }

  overlay = new BrowserWindow(
    overlayWindowOptions({
      ...bounds,
      backgroundColor: '#000000',
      enableLargerThanScreen: true,
      type: process.platform === 'darwin' ? 'panel' : undefined,
    }),
  )
  overlay.setAlwaysOnTop(true, 'screen-saver')
  overlay.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true,
  })
  // Cover the menu bar and dock too
  overlay.setBounds(bounds)
  overlay.on('closed', () => {
    overlay = null
    frame = null
  })
  loadRoute(overlay, 'capture')
}

export function registerCaptureIpc(onCaptured: (png: Buffer) => void): void {
  const fromOverlay = (e: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) =>
    !!overlay && !overlay.isDestroyed() && e.sender === overlay.webContents

  ipcMain.handle('capture:frame', (e) => (fromOverlay(e) ? frame : null))

  ipcMain.on('capture:ready', (e) => {
    if (!fromOverlay(e) || !overlay) return
    overlay.show()
    overlay.focus()
  })

  ipcMain.on('capture:hide', (e) => {
    if (fromOverlay(e)) overlay?.hide()
  })

  ipcMain.on('capture:cancel', (e) => {
    if (fromOverlay(e)) closeOverlay()
  })

  ipcMain.on('capture:done', (e, png: Uint8Array) => {
    if (!fromOverlay(e)) return
    closeOverlay()
    onCaptured(Buffer.from(png))
  })
}
