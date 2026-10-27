import { execFile } from 'node:child_process'
import { app, BrowserWindow, desktopCapturer, shell, systemPreferences } from 'electron'
import type { ScreenAccess, ToolId } from '../shared/tools'
import { getSettings, updateSettings } from './settings'
import { createAppWindow } from './windows'

// macOS asks before any app may capture the screen. A newly granted permission only takes
// effect after the app restarts, so Xssential walks the user through it in a setup window,
// restarts itself once access is turned on and then reopens the tool they picked.

const isMac = process.platform === 'darwin'
// Matches appId in electron-builder.yml
const BUNDLE_ID = 'io.github.chiragbhargavaa.xssential'
// How long a picked tool waits to be reopened after a restart
const RESUME_FOR_MS = 15 * 60 * 1000

let setup: BrowserWindow | null = null
let setupTool: ToolId | null = null
// Lets the user carry on when macOS reports the permission wrongly
let bypassUntil = 0
// Set when the user quits from Xssential's own menus or Xssential restarts itself
let expectedQuit = false

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

// macOS keeps one Screen Recording entry per app. After an update it can show Xssential as
// switched on while still denying the new version, and flipping the switch doesn't help.
// Clearing the entry and asking again gives a fresh switch to turn on.
export async function resetScreenAccess(): Promise<void> {
  if (!isMac || !app.isPackaged) return
  await new Promise<void>((resolve) => {
    execFile('/usr/bin/tccutil', ['reset', 'ScreenCapture', BUNDLE_ID], (err) => {
      if (err) console.error('Could not reset the screen recording permission', err)
      resolve()
    })
  })
  await requestScreenAccess()
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

export function quitApp(): void {
  expectedQuit = true
  app.quit()
}

// macOS's "Quit & Reopen" doesn't always reopen the app. Any quit Xssential didn't ask for
// while the user is setting up the permission is most likely that, so it comes back.
export function reopenIfSettingUp(): void {
  if (isMac && !expectedQuit && pendingResume()) app.relaunch()
}

export function restartApp(): void {
  expectedQuit = true
  app.relaunch()
  app.quit()
  // Don't hang if a window holds up quitting
  setTimeout(() => app.exit(0), 3000).unref()
}
