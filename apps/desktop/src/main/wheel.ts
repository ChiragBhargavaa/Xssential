import { BrowserWindow, screen } from 'electron'
import { loadRoute, overlayWindowOptions } from './windows'

// Window size; the ring itself is drawn smaller so its shadow has room
const SIZE = 380

let wheel: BrowserWindow | null = null

function create(): BrowserWindow {
  const win = new BrowserWindow(
    overlayWindowOptions({
      width: SIZE,
      height: SIZE,
      transparent: true,
      backgroundColor: '#00000000',
      // A non-activating panel takes keyboard focus without pulling the app (and any open
      // editor windows) to the front, so dismissing the wheel returns you to where you were.
      type: process.platform === 'darwin' ? 'panel' : undefined,
    }),
  )
  win.setAlwaysOnTop(true, 'pop-up-menu')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  win.on('blur', () => hideWheel())
  win.on('closed', () => {
    wheel = null
  })
  loadRoute(win, 'wheel')
  return win
}

// Created at startup so the wheel opens instantly
export function prepareWheel(): void {
  if (!wheel) wheel = create()
}

export function isWheelVisible(): boolean {
  return !!wheel && !wheel.isDestroyed() && wheel.isVisible()
}

export function showWheel(): void {
  if (!wheel || wheel.isDestroyed()) wheel = create()
  const cursor = screen.getCursorScreenPoint()
  const area = screen.getDisplayNearestPoint(cursor).workArea
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
  const x = clamp(Math.round(cursor.x - SIZE / 2), area.x, area.x + area.width - SIZE)
  const y = clamp(Math.round(cursor.y - SIZE / 2), area.y, area.y + area.height - SIZE)
  wheel.setBounds({ x, y, width: SIZE, height: SIZE })
  wheel.webContents.send('wheel:show')
  wheel.show()
  wheel.focus()
}

export function hideWheel(): void {
  if (wheel && !wheel.isDestroyed() && wheel.isVisible()) wheel.hide()
}

export function toggleWheel(): void {
  if (isWheelVisible()) hideWheel()
  else showWheel()
}
