import { app, BrowserWindow, globalShortcut, ipcMain, Menu, shell } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { TOOLS, type ToolId } from '../shared/tools'
import { registerBackgroundIpc, registerBackgroundScheme } from './backgrounds'
import { registerCaptureIpc, startCapture } from './capture'
import { registerFileIpc } from './files'
import { registerMusicIpc } from './music'
import {
  bypassScreenCheck,
  clearResume,
  closeSetup,
  ensureScreenAccess,
  openScreenSettings,
  openSetup,
  pendingResume,
  quitApp,
  reopenIfSettingUp,
  requestScreenAccess,
  resetScreenAccess,
  restartApp,
  screenAccess,
} from './permissions'
import { isRecording, registerRecorderIpc, requestStopRecording } from './recorder'
import { getSettings, updateSettings } from './settings'
import { createTray, setTrayRecording, updateTrayShortcut } from './tray'
import { hideWheel, prepareWheel, toggleWheel } from './wheel'
import { allAppWindows, createAppWindow, hasVisibleAppWindows } from './windows'
import { guardXContents, isXContents, registerXIpc } from './x'

const isMac = process.platform === 'darwin'

// Screenshots handed to new editor windows, keyed by their webContents id
const pendingImages = new Map<number, Buffer>()
let home: BrowserWindow | null = null

function openHome() {
  if (home && !home.isDestroyed()) {
    home.show()
    home.focus()
    return
  }
  home = createAppWindow({
    route: 'home',
    width: 920,
    height: 700,
    minWidth: 720,
    minHeight: 560,
    title: 'Xssential',
  })
  home.on('closed', () => {
    home = null
  })
}

function openImageEditor(png?: Buffer) {
  const win = createAppWindow({
    route: 'image',
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 620,
    title: 'Screenshot — Xssential',
  })
  const id = win.webContents.id
  if (png) pendingImages.set(id, png)
  win.on('closed', () => pendingImages.delete(id))
}

function openVideoStudio(mode: 'record' | 'import') {
  createAppWindow({
    route: 'video',
    query: `mode=${mode}`,
    width: 1400,
    height: 900,
    minWidth: 1040,
    minHeight: 680,
    title: 'Video — Xssential',
    // Keep encoding at full speed while the window is hidden during a recording
    backgroundThrottling: false,
  })
}

function openCarousel() {
  createAppWindow({
    route: 'carousel',
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 620,
    title: 'Carousel — Xssential',
  })
}

function launch(tool: ToolId) {
  hideWheel()
  switch (tool) {
    case 'screenshot':
      // Give the wheel a moment to leave the screen so it isn't in the screenshot
      if (!ensureScreenAccess('screenshot')) break
      setTimeout(() => void startCapture(), 180)
      break
    case 'record':
      if (isRecording()) requestStopRecording()
      else if (ensureScreenAccess('record')) openVideoStudio('record')
      break
    case 'edit-video':
      openVideoStudio('import')
      break
    case 'carousel':
      openCarousel()
      break
    case 'edit-image':
      openImageEditor()
      break
    case 'settings':
      openHome()
      break
  }
}

// The one global shortcut opens the wheel, or stops a running recording
function onShortcut() {
  if (isRecording()) requestStopRecording()
  else toggleWheel()
}

function registerShortcut(accelerator: string): boolean {
  try {
    return globalShortcut.register(accelerator, onShortcut)
  } catch {
    return false
  }
}

function setApplicationMenu() {
  if (!isMac) {
    Menu.setApplicationMenu(null)
    return
  }
  // Key presses reach the page first, so the editors' own Cmd+Z / Cmd+C handling wins and
  // these roles only act on text fields
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { label: 'Settings…', accelerator: 'Command+,', click: openHome },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { label: `Quit ${app.name}`, accelerator: 'Command+Q', click: quitApp },
        ],
      },
      { label: 'File', submenu: [{ role: 'close' }] },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      { role: 'windowMenu' },
    ]),
  )
}

function registerAppIpc() {
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), packaged: app.isPackaged }))
  ipcMain.handle('settings:get', () => {
    const settings = getSettings()
    // False when another app already owns the shortcut
    return { ...settings, shortcutActive: globalShortcut.isRegistered(settings.shortcut) }
  })

  ipcMain.handle('settings:set-shortcut', async (_e, accelerator: string) => {
    const previous = getSettings().shortcut
    if (accelerator === previous) return { ok: true }
    globalShortcut.unregister(previous)
    if (!registerShortcut(accelerator)) {
      registerShortcut(previous)
      return {
        ok: false,
        error: 'That shortcut is taken by the system or another app. Try a different one.',
      }
    }
    await updateSettings({ shortcut: accelerator })
    updateTrayShortcut(accelerator)
    return { ok: true }
  })

  ipcMain.handle('settings:set-launch-at-login', async (_e, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled })
    await updateSettings({ launchAtLogin: enabled })
  })

  ipcMain.handle('permissions:screen', () => screenAccess())
  ipcMain.on('permissions:open-screen-settings', () => openScreenSettings())
  ipcMain.handle('permissions:request-screen', () => requestScreenAccess())
  ipcMain.handle('permissions:reset-screen', () => resetScreenAccess())
  ipcMain.on('permissions:open-setup', (_e, tool: ToolId | null) => {
    openSetup(tool && TOOLS.some((t) => t.id === tool) ? tool : null)
  })
  ipcMain.on('permissions:restart', () => restartApp())
  // "Try anyway" in the setup window, for when macOS misreports the permission
  ipcMain.on('permissions:continue', (_e, tool: ToolId | null) => {
    bypassScreenCheck()
    clearResume()
    closeSetup()
    if (tool && TOOLS.some((t) => t.id === tool)) launch(tool)
  })

  ipcMain.on('tools:launch', (_e, tool: ToolId) => {
    if (TOOLS.some((t) => t.id === tool)) launch(tool)
  })
  ipcMain.on('wheel:hide', () => hideWheel())

  ipcMain.handle('image:take-pending', (e) => {
    const png = pendingImages.get(e.sender.id) ?? null
    pendingImages.delete(e.sender.id)
    return png
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  const startedAt = Date.now()
  app.on('second-instance', () => {
    // After "Quit & Reopen" both macOS and Xssential may reopen the app. The extra launch
    // arrives within moments and shouldn't pop up the home window.
    if (Date.now() - startedAt > 5000) openHome()
  })

  registerBackgroundScheme()

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('io.github.chiragbhargavaa.xssential')
    if (isMac && allAppWindows().length === 0) app.dock?.hide()

    // F12 toggles DevTools in development; reload shortcuts are disabled in production
    app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

    setApplicationMenu()
    registerAppIpc()
    registerFileIpc()
    registerBackgroundIpc()
    registerMusicIpc()
    registerXIpc()
    registerCaptureIpc((png) => openImageEditor(png))
    registerRecorderIpc({
      onStart: () => setTrayRecording(true),
      onStop: () => setTrayRecording(false),
    })

    const settings = getSettings()
    createTray(
      { launch, openWheel: toggleWheel, stopRecording: requestStopRecording, quit: quitApp },
      settings.shortcut,
    )
    if (!registerShortcut(settings.shortcut)) {
      console.warn(`Could not register the global shortcut ${settings.shortcut}`)
    }
    prepareWheel()

    if (!settings.onboarded) {
      openHome()
      void updateSettings({ onboarded: true })
    }

    // Back from a restart for the screen recording permission (ours, or macOS's
    // "Quit & Reopen"): carry on with the tool the user picked, or keep guiding them
    const resume = pendingResume()
    if (resume) {
      if (screenAccess() === 'granted') {
        clearResume()
        setTimeout(() => launch(resume), 800)
      } else {
        openSetup(resume)
      }
    }

    // Open a tool straight away in development, e.g. XSSENTIAL_OPEN_TOOL=carousel pnpm dev:desktop
    const devTool = process.env['XSSENTIAL_OPEN_TOOL'] as ToolId | undefined
    if (is.dev && devTool && TOOLS.some((t) => t.id === devTool)) launch(devTool)

    // Updates are pulled from GitHub Releases (see electron-builder.yml `publish`)
    if (app.isPackaged) {
      autoUpdater
        .checkForUpdatesAndNotify()
        .catch((err) => console.error('Update check failed', err))
    }

    app.on('activate', () => {
      if (!hasVisibleAppWindows()) openHome()
    })
  })

  app.on('web-contents-created', (_, contents) => {
    if (isXContents(contents)) {
      guardXContents(contents)
      return
    }
    // Links (such as music credits) open in the browser, never inside the app
    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) shell.openExternal(url)
      return { action: 'deny' }
    })
    contents.on('will-navigate', (event, url) => {
      const origin = (u: string) => {
        try {
          return new URL(u).origin
        } catch {
          return null
        }
      }
      if (origin(url) !== origin(contents.getURL())) {
        event.preventDefault()
        if (url.startsWith('https://')) shell.openExternal(url)
      }
    })
  })

  // Xssential keeps running in the menu bar / notification area after its windows close
  app.on('window-all-closed', () => {})

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    reopenIfSettingUp()
  })
}
