import { app, BrowserWindow, desktopCapturer, shell, systemPreferences } from 'electron'
import type { ScreenAccess, ToolId } from '../shared/tools'
import { getSettings, updateSettings } from './settings'
import { createAppWindow } from './windows'

// macOS asks before any app may capture the screen. A newly granted permission only takes
// effect after the app restarts, so Xssential walks the user through it in a setup window,
// restarts itself once access is turned on and then reopens the tool they picked.

const isMac = process.platform === 'darwin'
// How long a picked tool waits to be reopened after a restart
const RESUME_FOR_MS = 15 * 60 * 1000

let setup: BrowserWindow | null = null
let setupTool: ToolId | null = null
// Lets the user carry on when macOS reports the permission wrongly
let bypassUntil = 0

export function screenAccess(): ScreenAccess {
  if (!isMac) return 'granted'
  return systemPreferences.getMediaAccessStatus('screen') as ScreenAccess
}

export const hasScreenAccess = (): boolean =>
  screenAccess() === 'granted' || Date.now() < bypassUntil

export function openScreenSettings(): void {
  if (isMac) {
    shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
    )
  }
}

// Any capture attempt adds Xssential to the Screen Recording list in System Settings (and
// shows macOS's own prompt the first time), so it can be switched on there
export async function requestScreenAccess(): Promise<void> {
  if (!isMac) return
  if (screenAccess() !== 'granted') {
    await desktopCapturer
      .getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } })
      .catch(() => {})
  }
  openScreenSettings()
}

export function openSetup(tool: ToolId | null): void {
  if (setup && !setup.isDestroyed()) {
    if (setupTool === tool) {
      setup.show()
      setup.focus()
      return
    }
    setup.close()
  }
  setupTool = tool
  setup = createAppWindow({
    route: 'setup',
    query: tool ? `tool=${tool}` : '',
    width: 560,
    height: 720,
    minWidth: 480,
    minHeight: 600,
    title: 'Screen recording permission — Xssential',
  })
  setup.on('closed', () => {
    setup = null
  })
}

export function closeSetup(): void {
  if (setup && !setup.isDestroyed()) setup.close()
}

// Called before screenshots and recordings. Without access it remembers the tool, opens
// the setup window and returns false.
export function ensureScreenAccess(tool: ToolId): boolean {
  if (hasScreenAccess()) return true
  void updateSettings({ resume: { tool, at: Date.now() } })
  openSetup(tool)
  return false
}

export function bypassScreenCheck(): void {
  bypassUntil = Date.now() + 10 * 60 * 1000
}

// The tool to reopen after a restart, if the restart was for the permission
export function pendingResume(): ToolId | null {
  const { resume } = getSettings()
  if (!resume) return null
  if (Date.now() - resume.at > RESUME_FOR_MS) {
    void updateSettings({ resume: null })
    return null
  }
  return resume.tool
}

export function clearResume(): void {
  if (getSettings().resume) void updateSettings({ resume: null })
}

export function restartApp(): void {
  app.relaunch()
  app.quit()
  // Don't hang if a window holds up quitting
  setTimeout(() => app.exit(0), 3000).unref()
}
