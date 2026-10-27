import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppInfo,
  CaptureFrame,
  CaptureSource,
  ImageFilter,
  MusicTrack,
  ScreenAccess,
  Settings,
  ToolId,
  XAccount,
} from '../shared/tools'

type Kind = 'image' | 'video'

function subscribe(channel: string, listener: () => void): () => void {
  const handler = () => listener()
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

// Only expose a narrow, explicit API to the renderer
const api = {
  platform: process.platform,
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  getInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),

  settings: {
    get: (): Promise<Settings & { shortcutActive: boolean }> => ipcRenderer.invoke('settings:get'),
    setShortcut: (accelerator: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('settings:set-shortcut', accelerator),
    setLaunchAtLogin: (enabled: boolean): Promise<void> =>
      ipcRenderer.invoke('settings:set-launch-at-login', enabled),
  },

  permissions: {
    screen: (): Promise<ScreenAccess> => ipcRenderer.invoke('permissions:screen'),
    openScreenSettings: (): void => ipcRenderer.send('permissions:open-screen-settings'),
    // Adds Xssential to the Screen Recording list and opens System Settings there
    request: (): Promise<void> => ipcRenderer.invoke('permissions:request-screen'),
    // Clears a stale Screen Recording entry, then adds a fresh one to switch on
    reset: (): Promise<void> => ipcRenderer.invoke('permissions:reset-screen'),
    openSetup: (tool?: ToolId): void => ipcRenderer.send('permissions:open-setup', tool ?? null),
    restart: (): void => ipcRenderer.send('permissions:restart'),
    continueAnyway: (tool: ToolId | null): void => ipcRenderer.send('permissions:continue', tool),
  },

  tools: {
    launch: (tool: ToolId): void => ipcRenderer.send('tools:launch', tool),
  },

  wheel: {
    hide: (): void => ipcRenderer.send('wheel:hide'),
    onShow: (listener: () => void) => subscribe('wheel:show', listener),
  },

  capture: {
    getFrame: (): Promise<CaptureFrame | null> => ipcRenderer.invoke('capture:frame'),
    ready: (): void => ipcRenderer.send('capture:ready'),
    hide: (): void => ipcRenderer.send('capture:hide'),
    cancel: (): void => ipcRenderer.send('capture:cancel'),
    done: (png: Uint8Array): void => ipcRenderer.send('capture:done', png),
  },

  image: {
    takePending: (): Promise<Uint8Array | null> => ipcRenderer.invoke('image:take-pending'),
  },

  files: {
    save: (args: {
      data: Uint8Array
      name: string
      kind: Kind
      filters: ImageFilter[]
    }): Promise<string | null> => ipcRenderer.invoke('files:save', args),
    saveMany: (args: {
      files: { name: string; data: Uint8Array }[]
      title: string
    }): Promise<string | null> => ipcRenderer.invoke('files:save-many', args),
    openWrite: (args: {
      name: string
      kind: Kind
      filters: ImageFilter[]
    }): Promise<{ id: number; path: string } | null> =>
      ipcRenderer.invoke('files:open-write', args),
    write: (id: number, position: number, data: Uint8Array): Promise<void> =>
      ipcRenderer.invoke('files:write', id, position, data),
    close: (id: number): Promise<void> => ipcRenderer.invoke('files:close', id),
    abort: (id: number): Promise<void> => ipcRenderer.invoke('files:abort', id),
    reveal: (path: string): void => ipcRenderer.send('files:reveal', path),
  },

  clipboard: {
    writeImage: (png: Uint8Array): Promise<void> =>
      ipcRenderer.invoke('clipboard:write-image', png),
    readImage: (): Promise<Uint8Array | null> => ipcRenderer.invoke('clipboard:read-image'),
  },

  x: {
    account: (): Promise<XAccount> => ipcRenderer.invoke('x:account'),
    signIn: (): Promise<XAccount> => ipcRenderer.invoke('x:sign-in'),
    signOut: (): Promise<void> => ipcRenderer.invoke('x:sign-out'),
    // Opens X's composer with the image attached; resolves when that window closes
    post: (jpeg: Uint8Array): Promise<'posted' | 'closed'> => ipcRenderer.invoke('x:post', jpeg),
  },

  recorder: {
    getSources: (): Promise<CaptureSource[]> => ipcRenderer.invoke('recorder:sources'),
    select: (id: string): Promise<void> => ipcRenderer.invoke('recorder:select', id),
    started: (): void => ipcRenderer.send('recorder:started'),
    stopped: (): void => ipcRenderer.send('recorder:stopped'),
    setWindowVisible: (visible: boolean): void => ipcRenderer.send('recorder:set-visible', visible),
    onStopRequest: (listener: () => void) => subscribe('recorder:stop-request', listener),
  },

  music: {
    search: (query: string, page = 1): Promise<{ tracks: MusicTrack[]; pageCount: number }> =>
      ipcRenderer.invoke('music:search', { query, page }),
    download: (url: string): Promise<Uint8Array> => ipcRenderer.invoke('music:download', url),
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
