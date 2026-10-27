import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, ipcMain, protocol } from 'electron'
import { BACKGROUND_SCHEME } from '../shared/tools'

// Images the user picks as an editor background are copied into the app's data folder and
// served over their own scheme. Their URL then stays valid after a restart, so the editors
// can remember an uploaded background like they remember a built-in photo.

const TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
}
const MIME = Object.fromEntries(Object.entries(TYPES).map(([type, ext]) => [ext, type]))
const NAME = /^[0-9a-f]{16}\.(png|jpg|webp|gif|avif|bmp)$/
const MAX_BYTES = 50 * 1024 * 1024
// Older uploads are deleted, keeping enough for the image and video editors' choices
const KEEP = 5

const folder = () => join(app.getPath('userData'), 'backgrounds')

// Must run before the app is ready
export function registerBackgroundScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: BACKGROUND_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
    },
  ])
}

async function prune(): Promise<void> {
  const names = (await readdir(folder())).filter((n) => NAME.test(n))
  const files = await Promise.all(
    names.map(async (name) => ({ name, time: (await stat(join(folder(), name))).mtimeMs })),
  )
  files.sort((a, b) => b.time - a.time)
  await Promise.all(files.slice(KEEP).map((f) => rm(join(folder(), f.name), { force: true })))
}

export function registerBackgroundIpc(): void {
  protocol.handle(BACKGROUND_SCHEME, async (request) => {
    const name = new URL(request.url).pathname.slice(1)
    if (!NAME.test(name)) return new Response(null, { status: 404 })
    try {
      const data = await readFile(join(folder(), name))
      return new Response(new Uint8Array(data), {
        headers: {
          'Content-Type': MIME[name.split('.')[1]!]!,
          // Pages are served from file:// (or localhost in development), another origin
          'Access-Control-Allow-Origin': '*',
        },
      })
    } catch {
      return new Response(null, { status: 404 })
    }
  })

  ipcMain.handle('backgrounds:save', async (_e, data: Uint8Array, type: string) => {
    const ext = TYPES[type]
    if (!ext) throw new Error('Unsupported image type')
    if (data.byteLength > MAX_BYTES) throw new Error('Image is too large')
    // Named by content, so picking the same image again reuses its file
    const name = `${createHash('sha256').update(data).digest('hex').slice(0, 16)}.${ext}`
    await mkdir(folder(), { recursive: true })
    await writeFile(join(folder(), name), data)
    await prune()
    return `${BACKGROUND_SCHEME}://uploads/${name}`
  })
}
