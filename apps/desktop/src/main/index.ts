import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 500,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
    },
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  // Open external links in the user's browser instead of a new Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('io.github.chiragbhargavaa.xssential')

  // F12 toggles DevTools in development; reload shortcuts are disabled in production
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  ipcMain.handle('app:version', () => app.getVersion())

  createWindow()

  // Updates are pulled from GitHub Releases (see electron-builder.yml `publish`)
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => console.error('Update check failed', err))
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
