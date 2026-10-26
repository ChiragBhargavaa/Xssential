import { app, BrowserWindow, desktopCapturer, ipcMain, session, type WebContents } from 'electron'
import type { CaptureSource } from '../shared/tools'
import { hasScreenAccess } from './permissions'

let pendingSourceId: string | null = null
let recorder: WebContents | null = null

interface RecorderHooks {
  onStart: () => void
  onStop: () => void
}

export const isRecording = (): boolean => !!recorder && !recorder.isDestroyed()

// Asks the window that is recording to stop. It finalizes the file and reports back.
export function requestStopRecording(): void {
  if (isRecording()) recorder!.send('recorder:stop-request')
}

export function registerRecorderIpc(hooks: RecorderHooks): void {
  const finish = () => {
    if (!recorder) return
    recorder = null
    hooks.onStop()
  }

  // getDisplayMedia() in the renderer records whatever source was picked in our own picker
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const id = pendingSourceId
    pendingSourceId = null
    if (!id) return callback(null)
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 0, height: 0 },
    })
    const source = sources.find((s) => s.id === id)
    callback(source ? { video: source } : null)
  })

  ipcMain.handle('recorder:sources', async (): Promise<CaptureSource[]> => {
    // The picker shows its own prompt to set up the permission
    if (!hasScreenAccess()) return []
    // Leave Xssential's own windows out of the picker
    const own = new Set(BrowserWindow.getAllWindows().map((w) => w.getMediaSourceId()))
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 480, height: 300 },
      fetchWindowIcons: true,
    })
    return sources
      .filter((s) => !own.has(s.id) && !s.thumbnail.isEmpty())
      .map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.id.startsWith('screen:') ? 'screen' : 'window',
        thumbnail: s.thumbnail.toDataURL(),
        icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
      }))
  })

  ipcMain.handle('recorder:select', (_e, id: string) => {
    pendingSourceId = id
  })

  ipcMain.on('recorder:started', (e) => {
    recorder = e.sender
    e.sender.once('destroyed', finish)
    hooks.onStart()
  })

  ipcMain.on('recorder:stopped', (e) => {
    if (e.sender === recorder) finish()
  })

  // The studio window steps aside while recording. On macOS hiding the app also hands
  // focus back to the app the user was in, which is usually what they want to record.
  ipcMain.on('recorder:set-visible', (e, visible: boolean) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    if (visible) {
      if (process.platform === 'darwin') app.show()
      win.show()
      win.focus()
    } else {
      win.hide()
      if (process.platform === 'darwin') app.hide()
    }
  })
}
