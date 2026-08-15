/** Runtime states published from Electron main to the isolated WebUI bridge. */
export type DesktopRuntimeState = 'starting' | 'running' | 'stopped' | 'error'

/** Read-only Desktop status shown by the Tray and available to the WebUI. */
export interface DesktopStatus {
  state: DesktopRuntimeState
  host: '0.0.0.0'
  port: number
  localUrl?: string
  lanUrl?: string
  message?: string
}

/** Narrow API exposed to the renderer through contextBridge. */
export interface DesktopApi {
  getStatus(): Promise<DesktopStatus>
  showWindow(): Promise<void>
  hideWindow(): Promise<void>
  restartRuntime(): Promise<DesktopStatus>
  pickFile(): Promise<string | null>
  pickDirectory(): Promise<string | null>
  openExternal(url: string): Promise<void>
  onStatus(listener: (status: DesktopStatus) => void): () => void
}
