import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi, DesktopStatus } from './contracts.ts'

const api: DesktopApi = {
  getStatus: () => ipcRenderer.invoke('desktop.getStatus') as Promise<DesktopStatus>,
  showWindow: () => ipcRenderer.invoke('desktop.showWindow') as Promise<void>,
  hideWindow: () => ipcRenderer.invoke('desktop.hideWindow') as Promise<void>,
  restartRuntime: () => ipcRenderer.invoke('desktop.restartRuntime') as Promise<DesktopStatus>,
  pickFile: () => ipcRenderer.invoke('desktop.pickFile') as Promise<string | null>,
  pickDirectory: () => ipcRenderer.invoke('desktop.pickDirectory') as Promise<string | null>,
  openExternal: url => ipcRenderer.invoke('desktop.openExternal', url) as Promise<void>,
  onStatus: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, status: DesktopStatus): void => { listener(status) }
    ipcRenderer.on('desktop.status', handler)
    return () => { ipcRenderer.removeListener('desktop.status', handler) }
  },
}

contextBridge.exposeInMainWorld('ohMyDshDesktop', api)
