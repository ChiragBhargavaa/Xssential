import { execFile } from 'node:child_process'
import {
  access,
  mkdir,
  open,
  readdir,
  stat,
  unlink,
  writeFile,
  type FileHandle,
} from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  app,
  BrowserWindow,
  clipboard,
  ClipboardItem,
  dialog,
  ipcMain,
  nativeImage,
  shell,
} from 'electron'
import type { ImageFilter } from '../shared/tools'
import { videoFolder } from './settings'

type Kind = 'image' | 'video'

// Remember where the user last saved during this session
const lastDir: Partial<Record<Kind, string>> = {}
const defaultDir = (kind: Kind) =>
  lastDir[kind] ?? app.getPath(kind === 'image' ? 'pictures' : 'videos')

// Only a plain file name from the renderer is used; the folder always comes from a dialog
const safeName = (name: string) => basename(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')

interface Writer {
  // Null once closed. Closed writers are kept so a failed export can still be deleted.
  handle: FileHandle | null
  path: string
  owner: number
}

const writers = new Map<number, Writer>()
let nextWriterId = 1

async function askSavePath(
  e: Electron.IpcMainInvokeEvent,
  kind: Kind,
  name: string,
  filters: ImageFilter[],
): Promise<string | null> {
  const win = BrowserWindow.fromWebContents(e.sender)
  const options = { defaultPath: join(defaultDir(kind), safeName(name)), filters }
  const { canceled, filePath } = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options)
  if (canceled || !filePath) return null
  lastDir[kind] = dirname(filePath)
  return filePath
}

// "name.mp4", then "name 2.mp4", "name 3.mp4"… so nothing is overwritten
async function uniquePath(dir: string, name: string): Promise<string> {
  const ext = extname(name)
  const stem = name.slice(0, name.length - ext.length)
  for (let i = 1; ; i++) {
    const path = join(dir, i === 1 ? name : `${stem} ${i}${ext}`)
    try {
      await access(path)
    } catch {
      return path
    }
  }
}

// Videos copied to the clipboard live here, since the clipboard only holds a reference
const clipboardDir = () => join(app.getPath('temp'), 'Xssential clipboard')

async function freshClipboardDir(): Promise<string> {
  const dir = clipboardDir()
  await mkdir(dir, { recursive: true })
  // Drop copies from earlier days; anything newer may still be waiting to be pasted
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000
  for (const name of await readdir(dir).catch(() => [])) {
    const path = join(dir, name)
    const info = await stat(path).catch(() => null)
    if (info && info.mtimeMs < dayAgo) await unlink(path).catch(() => {})
  }
  return dir
}

// Puts a file (not its contents) on the clipboard, like copying it in Finder or Explorer
async function copyFileToClipboard(path: string): Promise<void> {
  if (process.platform === 'win32') {
    await new Promise<void>((resolve, reject) =>
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', 'Set-Clipboard -LiteralPath $args[0]', path],
        (err) => (err ? reject(err) : resolve()),
      ),
    )
    return
  }
  const uri = pathToFileURL(path).href
  const raw = (format: string, text: string) => ({
    [`electron application/osclipboard;format="${format}"`]: new Blob([text], {
      type: 'text/plain',
    }),
  })
  await clipboard.write([
    new ClipboardItem(
      process.platform === 'darwin'
        ? raw('public.file-url', uri)
        : {
            ...raw('text/uri-list', `${uri}\r\n`),
            ...raw('x-special/gnome-copied-files', `copy\n${uri}`),
          },
    ),
  ])
}

function ownedWriter(e: Electron.IpcMainInvokeEvent, id: number): Writer {
  const writer = writers.get(id)
  if (!writer || writer.owner !== e.sender.id) throw new Error('Unknown file')
  return writer
}

export function registerFileIpc(): void {
  ipcMain.handle(
    'files:save',
    async (e, args: { data: Uint8Array; name: string; kind: Kind; filters: ImageFilter[] }) => {
      const path = await askSavePath(e, args.kind, args.name, args.filters)
      if (!path) return null
      await writeFile(path, args.data)
      return path
    },
  )

  ipcMain.handle(
    'files:save-many',
    async (e, args: { files: { name: string; data: Uint8Array }[]; title: string }) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      const options: Electron.OpenDialogOptions = {
        title: args.title,
        buttonLabel: 'Save Here',
        defaultPath: defaultDir('image'),
        properties: ['openDirectory', 'createDirectory'],
      }
      const { canceled, filePaths } = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)
      if (canceled || !filePaths[0]) return null
      const dir = filePaths[0]
      lastDir.image = dir
      await Promise.all(args.files.map((f) => writeFile(join(dir, safeName(f.name)), f.data)))
      return dir
    },
  )

  // Large exports (videos) are streamed to disk in chunks instead of being held in memory.
  // "ask" shows a save dialog, "folder" writes straight to the video folder from settings
  // and "clipboard" writes a temporary copy for clipboard:write-file.
  ipcMain.handle(
    'files:open-write',
    async (
      e,
      args: {
        name: string
        kind: Kind
        filters: ImageFilter[]
        target?: 'ask' | 'folder' | 'clipboard'
      },
    ) => {
      let path: string | null
      if (args.target === 'folder') {
        const dir = videoFolder()
        await mkdir(dir, { recursive: true })
        path = await uniquePath(dir, safeName(args.name))
      } else if (args.target === 'clipboard') {
        path = await uniquePath(await freshClipboardDir(), safeName(args.name))
      } else {
        path = await askSavePath(e, args.kind, args.name, args.filters)
      }
      if (!path) return null
      const id = nextWriterId++
      writers.set(id, { handle: await open(path, 'w'), path, owner: e.sender.id })
      return { id, path }
    },
  )

  // Only files this window finished writing can be copied
  ipcMain.handle('clipboard:write-file', async (e, id: number) => {
    const writer = ownedWriter(e, id)
    if (writer.handle) throw new Error('File is still being written')
    writers.delete(id)
    await copyFileToClipboard(writer.path)
  })

  ipcMain.handle('files:write', async (e, id: number, position: number, data: Uint8Array) => {
    const { handle } = ownedWriter(e, id)
    if (!handle) throw new Error('File already closed')
    await handle.write(data, 0, data.byteLength, position)
  })

  ipcMain.handle('files:close', async (e, id: number) => {
    const writer = ownedWriter(e, id)
    const { handle } = writer
    writer.handle = null
    await handle?.close()
  })

  // Deletes a partly written file after a failed or canceled export
  ipcMain.handle('files:abort', async (e, id: number) => {
    const writer = ownedWriter(e, id)
    writers.delete(id)
    await writer.handle?.close()
    await unlink(writer.path).catch(() => {})
  })

  ipcMain.on('files:reveal', (_e, path: string) => shell.showItemInFolder(path))

  ipcMain.handle('clipboard:write-image', async (_e, png: Uint8Array) => {
    await clipboard.write([
      new ClipboardItem({
        'image/png': new Blob([png as Uint8Array<ArrayBuffer>], { type: 'image/png' }),
      }),
    ])
  })

  ipcMain.handle('clipboard:read-image', async () => {
    for (const item of await clipboard.read()) {
      const type =
        item.types.find((t) => t === 'image/png') ?? item.types.find((t) => t.startsWith('image/'))
      if (!type) continue
      const blob = (await item.getType(type)) as Blob
      const data = Buffer.from(await blob.arrayBuffer())
      if (type === 'image/png') return data
      // Other formats (TIFF from macOS screenshots, for example) are converted to PNG
      const image = nativeImage.createFromBuffer(data)
      if (!image.isEmpty()) return image.toPNG()
    }
    return null
  })
}
