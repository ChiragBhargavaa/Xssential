import { unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  app,
  BrowserWindow,
  ipcMain,
  session,
  shell,
  type Session,
  type WebContents,
} from 'electron'
import type { XAccount } from '../shared/tools'
import { getSettings, updateSettings } from './settings'

// Posting goes through x.com itself, in windows with their own cookie jar. The user signs in
// on X's own page, so Xssential never sees their password and needs no API keys. Xssential
// attaches the image to X's composer; the user writes the post and presses Post.

const PARTITION = 'persist:x'
const X_HOSTS = ['x.com', 'twitter.com']
// "Continue with Google / Apple" on X's sign-in page
const AUTH_HOSTS = ['google.com', 'apple.com']
const FILE_INPUT = 'input[data-testid="fileInput"]'

let xSession: Session | null = null
let signInWindow: BrowserWindow | null = null

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function hostIn(url: string, hosts: string[]): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === 'https:' && hosts.some((h) => hostname === h || hostname.endsWith(`.${h}`))
  } catch {
    return false
  }
}

const isCompose = (url: string) =>
  hostIn(url, X_HOSTS) && new URL(url).pathname.startsWith('/compose/')

// Called when a post is sent from a composer window, keyed by its webContents id
const onSent = new Map<number, () => void>()

function getXSession(): Session {
  if (xSession) return xSession
  xSession = session.fromPartition(PARTITION)
  // Look like plain Chrome; Google's sign-in turns away browsers that name themselves Electron
  xSession.setUserAgent(
    xSession
      .getUserAgent()
      .replace(/ Electron\/\S+/, '')
      .replace(/\(KHTML, like Gecko\) .*?Chrome\//, '(KHTML, like Gecko) Chrome/'),
  )
  xSession.webRequest.onCompleted({ urls: ['https://x.com/i/api/graphql/*'] }, (details) => {
    if (
      details.statusCode === 200 &&
      details.webContentsId !== undefined &&
      /\/(CreateTweet|CreateNoteTweet)$/.test(new URL(details.url).pathname)
    ) {
      onSent.get(details.webContentsId)?.()
    }
  })
  return xSession
}

export const isXContents = (contents: WebContents): boolean =>
  xSession !== null && contents.session === xSession

// X pages (and their Google / Apple sign-in popups) stay on X and its sign-in providers;
// other links open in the browser
export function guardXContents(contents: WebContents): void {
  contents.setWindowOpenHandler(({ url }) => {
    if (hostIn(url, AUTH_HOSTS)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: { width: 520, height: 680, autoHideMenuBar: true },
      }
    }
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, url) => {
    if (hostIn(url, [...X_HOSTS, ...AUTH_HOSTS])) return
    event.preventDefault()
    if (url.startsWith('https://')) shell.openExternal(url)
  })
}

function openXWindow(parent: BrowserWindow | null, title: string, url: string): BrowserWindow {
  const width = 640
  const height = 780
  const at = parent && !parent.isDestroyed() ? parent.getBounds() : null
  const win = new BrowserWindow({
    width,
    height,
    ...(at && {
      x: Math.round(at.x + (at.width - width) / 2),
      y: Math.round(at.y + Math.max(0, (at.height - height) / 2)),
    }),
    title,
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    // A plain web page: no preload, so x.com gets no access to Xssential
    webPreferences: { session: getXSession(), sandbox: true, contextIsolation: true },
  })
  win.on('page-title-updated', (e) => e.preventDefault())
  void win.loadURL(url)
  return win
}

export async function getXAccount(): Promise<XAccount> {
  const cookies = await getXSession().cookies.get({ name: 'auth_token' })
  const signedIn = cookies.some((c) => hostIn(`https://${c.domain?.replace(/^\./, '')}`, X_HOSTS))
  return { signedIn, handle: signedIn ? getSettings().xHandle : null }
}

// Reads the signed-in username from X's navigation, which links to the profile
async function rememberHandle(contents: WebContents): Promise<void> {
  for (let i = 0; i < 40 && !contents.isDestroyed(); i++) {
    const href: string | null = await contents
      .executeJavaScript(
        `document.querySelector('a[data-testid="AppTabBar_Profile_Link"]')?.getAttribute('href') ?? null`,
      )
      .catch(() => null)
    const handle = href?.match(/^\/(\w{1,15})$/)?.[1]
    if (handle) {
      if (handle !== getSettings().xHandle) await updateSettings({ xHandle: handle })
      return
    }
    await delay(250)
  }
}

export function signIn(parent: BrowserWindow | null): Promise<XAccount> {
  if (signInWindow && !signInWindow.isDestroyed()) {
    signInWindow.focus()
    return new Promise((resolve) => signInWindow!.once('closed', () => resolve(getXAccount())))
  }
  const win = openXWindow(parent, 'Sign in to X', 'https://x.com/i/flow/login')
  signInWindow = win
  const contents = win.webContents
  // X sends a signed-in user to their home timeline
  const check = async (url: string) => {
    if (!hostIn(url, X_HOSTS) || new URL(url).pathname !== '/home') return
    if (!(await getXAccount()).signedIn) return
    await rememberHandle(contents)
    if (!win.isDestroyed()) win.close()
  }
  contents.on('did-navigate', (_e, url) => void check(url))
  contents.on('did-navigate-in-page', (_e, url) => void check(url))
  return new Promise((resolve) => {
    win.once('closed', () => {
      signInWindow = null
      resolve(getXAccount())
    })
  })
}

export async function signOut(): Promise<void> {
  await getXSession().clearStorageData()
  await updateSettings({ xHandle: null })
}

// Puts the image into X's composer, as if the user had picked it with the media button
async function attachImage(contents: WebContents, path: string): Promise<boolean> {
  // X draws the composer a moment after the page loads
  for (let i = 0; i < 60; i++) {
    if (contents.isDestroyed() || !isCompose(contents.getURL())) return false
    const found = await contents
      .executeJavaScript(`!!document.querySelector('${FILE_INPUT}')`)
      .catch(() => false)
    if (found) break
    await delay(250)
  }
  const dbg = contents.debugger
  try {
    dbg.attach('1.3')
    const { root } = await dbg.sendCommand('DOM.getDocument', { depth: 0 })
    // On wide windows the composer is a dialog over the timeline, which has a composer too
    for (const selector of [`[role="dialog"] ${FILE_INPUT}`, FILE_INPUT]) {
      const { nodeId } = await dbg.sendCommand('DOM.querySelector', {
        nodeId: root.nodeId,
        selector,
      })
      if (!nodeId) continue
      await dbg.sendCommand('DOM.setFileInputFiles', { nodeId, files: [path] })
      return true
    }
    return false
  } catch (err) {
    console.error('Could not attach the image to the post', err)
    return false
  } finally {
    if (dbg.isAttached()) dbg.detach()
  }
}

// Opens X's composer with the image attached and resolves once the window closes. Signed-out
// users get X's sign-in page first, which then returns to the composer.
export async function postToX(
  parent: BrowserWindow | null,
  jpeg: Uint8Array,
): Promise<'posted' | 'closed'> {
  const path = join(app.getPath('temp'), `xssential-post-${Date.now()}.jpg`)
  await writeFile(path, jpeg)
  const win = openXWindow(parent, 'Post on X', 'https://x.com/compose/post')
  const contents = win.webContents
  const id = contents.id
  let attached = false
  let attaching = false
  let sent = false

  const tryAttach = async () => {
    if (attached || attaching || !isCompose(contents.getURL())) return
    attaching = true
    attached = await attachImage(contents, path)
    attaching = false
    if (attached) void rememberHandle(contents)
  }
  contents.on('did-finish-load', () => void tryAttach())
  contents.on('did-navigate-in-page', () => void tryAttach())

  // X closes the composer once the post is sent; give it a moment to show that it went out
  onSent.set(id, () => {
    sent = true
    void (async () => {
      for (let i = 0; i < 24 && !win.isDestroyed(); i++) {
        if (!isCompose(contents.getURL())) {
          await delay(1200)
          break
        }
        await delay(250)
      }
      if (!win.isDestroyed()) win.close()
    })()
  })

  return new Promise((resolve) => {
    win.once('closed', () => {
      onSent.delete(id)
      void unlink(path).catch(() => {})
      resolve(sent ? 'posted' : 'closed')
    })
  })
}

export function registerXIpc(): void {
  ipcMain.handle('x:account', () => getXAccount())
  ipcMain.handle('x:sign-in', (e) => signIn(BrowserWindow.fromWebContents(e.sender)))
  ipcMain.handle('x:sign-out', () => signOut())
  ipcMain.handle('x:post', (e, jpeg: Uint8Array) =>
    postToX(BrowserWindow.fromWebContents(e.sender), jpeg),
  )
}
