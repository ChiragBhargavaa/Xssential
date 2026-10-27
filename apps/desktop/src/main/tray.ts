import { Menu, Tray, type MenuItemConstructorOptions } from 'electron'
import { TOOLS, type ToolId } from '../shared/tools'
import { trayColorIcon, trayRecordingIcon, trayTemplateIcon } from './icons'

interface TrayActions {
  launch: (tool: ToolId) => void
  openWheel: () => void
  stopRecording: () => void
  quit: () => void
}

const isMac = process.platform === 'darwin'

let tray: Tray | null = null
let actions: TrayActions
let shortcut = ''
let recordingTimer: NodeJS.Timeout | null = null

const idleIcon = () => (isMac ? trayTemplateIcon() : trayColorIcon())

function formatElapsed(ms: number) {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function idleMenu(): Menu {
  const toolItems: MenuItemConstructorOptions[] = TOOLS.filter((t) => t.id !== 'settings').map(
    (t) => ({ label: t.label, click: () => actions.launch(t.id) }),
  )
  return Menu.buildFromTemplate([
    {
      label: 'Open Tool Wheel',
      accelerator: shortcut || undefined,
      registerAccelerator: false,
      click: () => actions.openWheel(),
    },
    { type: 'separator' },
    ...toolItems,
    { type: 'separator' },
    { label: 'Settings…', click: () => actions.launch('settings') },
    { label: 'Quit Xssential', click: () => actions.quit() },
  ])
}

export function createTray(trayActions: TrayActions, accelerator: string): void {
  actions = trayActions
  shortcut = accelerator
  tray = new Tray(idleIcon())
  tray.setToolTip('Xssential')
  tray.setContextMenu(idleMenu())
  tray.on('click', () => {
    if (recordingTimer) actions.stopRecording()
    // On Windows a left click opens the wheel; right click shows the menu
    else if (!isMac) actions.openWheel()
  })
}

export function updateTrayShortcut(accelerator: string): void {
  shortcut = accelerator
  if (tray && !recordingTimer) tray.setContextMenu(idleMenu())
}

export function setTrayRecording(recording: boolean): void {
  if (!tray) return
  if (recording) {
    const startedAt = Date.now()
    const tick = () => {
      const elapsed = formatElapsed(Date.now() - startedAt)
      tray?.setToolTip(`Recording ${elapsed}. Click to stop.`)
      if (isMac) tray?.setTitle(` ${elapsed}`, { fontType: 'monospacedDigit' })
    }
    tray.setImage(trayRecordingIcon())
    // A single click stops the recording on macOS, so no menu is attached
    tray.setContextMenu(
      isMac
        ? null
        : Menu.buildFromTemplate([
            { label: 'Stop Recording', click: () => actions.stopRecording() },
          ]),
    )
    tick()
    recordingTimer = setInterval(tick, 1000)
  } else {
    if (recordingTimer) clearInterval(recordingTimer)
    recordingTimer = null
    tray.setImage(idleIcon())
    tray.setTitle('')
    tray.setToolTip('Xssential')
    tray.setContextMenu(idleMenu())
  }
}
