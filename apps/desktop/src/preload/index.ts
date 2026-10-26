import { contextBridge, ipcRenderer } from 'electron'

// Only expose a narrow, explicit API to the renderer
const api = {
  platform: process.platform,
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
