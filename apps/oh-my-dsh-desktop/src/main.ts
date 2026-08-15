import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, Notification, powerMonitor, shell, Tray } from 'electron'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startWebRuntime, type ManagedWebRuntime, type WebRuntimeExit } from '@graysilver/oh-my-dsh/launch'
import type { DesktopStatus } from './contracts.ts'
import { NotificationMonitor, type DesktopNotificationEvent } from './notification-monitor.ts'

const WEB_HOST = '0.0.0.0' as const
const WEB_PORT = 3080
const SINGLE_INSTANCE_LOCK = 'oh-my-dsh-desktop'

let mainWindow: BrowserWindow | undefined
let tray: Tray | undefined
let runtime: ManagedWebRuntime | undefined
let notifications: NotificationMonitor | undefined
let isQuitting = false
let startupPromise: Promise<DesktopStatus> | undefined
let startupController: AbortController | undefined
let status: DesktopStatus = { state: 'stopped', host: WEB_HOST, port: WEB_PORT }

const mainDirectory = dirname(fileURLToPath(import.meta.url))

function publishStatus(next: DesktopStatus): void {
  status = next
  updateTray()
  mainWindow?.webContents.send('desktop.status', status)
}

function localWorkspace(): string {
  const configured = process.env.OH_MY_DSH_CWD
  if (configured !== undefined && configured.trim() !== '') return configured
  return app.isPackaged ? homedir() : process.cwd()
}

function showWindow(): void {
  if (mainWindow === undefined) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function hideWindow(): void {
  mainWindow?.hide()
}

function trayStatusLabel(): string {
  if (status.state === 'running') return `运行中 · LAN ${status.lanUrl ?? '0.0.0.0:3080'}`
  if (status.state === 'starting') return '正在启动本地 runtime…'
  if (status.state === 'error') return `启动失败 · ${status.message ?? '请重试'}`
  return '已停止'
}

function updateTray(): void {
  if (tray === undefined) return
  const localUrl = status.localUrl
  const lanUrl = status.lanUrl
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 OhMyDSH', click: showWindow },
    { label: trayStatusLabel(), enabled: false },
    { type: 'separator' },
    ...(localUrl === undefined ? [] : [{ label: `Local: ${localUrl}`, enabled: false }]),
    ...(lanUrl === undefined ? [] : [{ label: `LAN: ${lanUrl}`, enabled: false }]),
    { label: '重启 runtime', click: () => { void startRuntime(true) } },
    { type: 'separator' },
    { label: '退出 OhMyDSH', click: () => { app.quit() } },
  ]))
  tray.setToolTip(`OhMyDSH · ${status.state === 'running' ? 'LAN 已开放' : status.state}`)
}

function startupErrorPage(message: string): string {
  const escaped = message.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  return `<!doctype html><meta charset="utf-8"><title>OhMyDSH</title><style>body{font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#f5f5f7;color:#1d1d1f;padding:48px;line-height:1.5}main{max-width:720px;margin:auto;background:#fff;border:1px solid #d2d2d7;border-radius:12px;padding:28px}h1{font-size:24px;margin:0 0 12px}p{white-space:pre-wrap}button{font:inherit;padding:8px 14px;border:0;border-radius:8px;background:#0071e3;color:#fff}</style><main><h1>OhMyDSH 无法启动</h1><p>${escaped}</p><p>Desktop 会继续驻留在菜单栏。修复端口或运行环境后，可从菜单栏重启 runtime。</p><button onclick="window.ohMyDshDesktop?.restartRuntime()">重试</button></main>`
}

async function loadRuntimePage(baseUrl: string, cwd: string): Promise<void> {
  if (mainWindow === undefined) return
  const url = new URL(baseUrl)
  url.searchParams.set('cwd', cwd)
  await mainWindow.loadURL(url.href)
}

async function handleRuntimeExit(current: ManagedWebRuntime, exit: WebRuntimeExit): Promise<void> {
  if (runtime !== current || isQuitting) return
  runtime = undefined
  await notifications?.stop()
  notifications = undefined
  const message = exit.signal === null
    ? `runtime 已退出（code=${String(exit.code)}）`
    : `runtime 被 ${exit.signal} 终止`
  publishStatus({ state: 'error', host: WEB_HOST, port: WEB_PORT, message })
  if (exit.code !== 0 && !mainWindow?.isFocused()) {
    showNativeNotification({ key: `runtime-exit:${String(exit.code)}:${String(exit.signal)}`, title: 'OhMyDSH runtime 已停止', body: message })
  }
}

function showNativeNotification(event: DesktopNotificationEvent): void {
  if (!Notification.isSupported()) return
  const notification = new Notification({ title: event.title, body: event.body })
  notification.on('click', showWindow)
  notification.show()
}

function onNotification(event: DesktopNotificationEvent): void {
  const isApprovalOrQuestion = event.title.includes('确认') || event.title.includes('回答')
  if (!isApprovalOrQuestion && mainWindow?.isFocused() === true && mainWindow.isVisible()) return
  showNativeNotification(event)
}

async function startRuntime(forceRestart = false): Promise<DesktopStatus> {
  if (startupPromise !== undefined) return startupPromise
  if (!forceRestart && runtime !== undefined) return status
  const controller = new AbortController()
  startupController = controller
  startupPromise = (async () => {
    const previous = runtime
    runtime = undefined
    await notifications?.stop()
    notifications = undefined
    if (previous !== undefined) await previous.stop()
    publishStatus({ state: 'starting', host: WEB_HOST, port: WEB_PORT })
    try {
      const current = await startWebRuntime({
        cwd: localWorkspace(),
        host: WEB_HOST,
        checkPortAvailability: true,
        forwardSignals: false,
        signal: controller.signal,
        onOutput: (stream, chunk) => {
          if (!app.isPackaged) (stream === 'stderr' ? console.error : console.log)(chunk.trimEnd())
        },
      })
      runtime = current
      const next: DesktopStatus = {
        state: 'running',
        host: WEB_HOST,
        port: WEB_PORT,
        localUrl: current.localUrl,
        ...(current.lanUrl === undefined ? {} : { lanUrl: current.lanUrl }),
      }
      publishStatus(next)
      notifications = new NotificationMonitor(current.localUrl, onNotification)
      notifications.start()
      void current.done.then(async (exit) => { await handleRuntimeExit(current, exit) })
      await loadRuntimePage(current.localUrl, localWorkspace())
      return next
    } catch (error) {
      if (isQuitting && controller.signal.aborted) return status
      const message = error instanceof Error ? error.message : String(error)
      publishStatus({ state: 'error', host: WEB_HOST, port: WEB_PORT, message })
      if (mainWindow !== undefined) await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(startupErrorPage(message))}`)
      return status
    } finally {
      if (startupController === controller) startupController = undefined
      startupPromise = undefined
    }
  })()
  return startupPromise
}

async function shutdown(): Promise<void> {
  const pendingStartup = startupPromise
  startupController?.abort()
  if (pendingStartup !== undefined) await pendingStartup
  await notifications?.stop()
  notifications = undefined
  const current = runtime
  runtime = undefined
  if (current !== undefined) await current.stop()
  globalShortcut.unregisterAll()
  tray?.destroy()
  tray = undefined
}

function registerIpc(): void {
  ipcMain.handle('desktop.getStatus', () => status)
  ipcMain.handle('desktop.showWindow', () => { showWindow() })
  ipcMain.handle('desktop.hideWindow', () => { hideWindow() })
  ipcMain.handle('desktop.restartRuntime', () => startRuntime(true))
  ipcMain.handle('desktop.pickFile', async () => {
    if (mainWindow === undefined) return null
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'] })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  ipcMain.handle('desktop.pickDirectory', async () => {
    if (mainWindow === undefined) return null
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  ipcMain.handle('desktop.openExternal', async (_event, url: unknown) => { await openExternal(url) })
}

function externalHttpUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('desktop.openExternal expects a URL')
  const parsed = new URL(value)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('desktop.openExternal only permits HTTP(S) URLs')
  }
  return parsed.href
}

async function openExternal(value: unknown): Promise<void> {
  await shell.openExternal(externalHttpUrl(value))
}

function isRuntimeNavigation(target: string): boolean {
  if (status.localUrl === undefined) return false
  return new URL(target).origin === new URL(status.localUrl).origin
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 920,
    minHeight: 640,
    show: false,
    title: 'OhMyDSH',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: join(mainDirectory, 'preload.mjs'),
    },
  })
  mainWindow.on('ready-to-show', showWindow)
  mainWindow.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    hideWindow()
  })
  mainWindow.on('closed', () => { mainWindow = undefined })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void openExternal(url).catch((error: unknown) => { console.warn('oh-my-dsh desktop: refused external URL', error) })
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isRuntimeNavigation(url)) return
    event.preventDefault()
    void openExternal(url).catch((error: unknown) => { console.warn('oh-my-dsh desktop: refused navigation URL', error) })
  })
}

function createTray(): void {
  const image = nativeImage.createFromNamedImage('NSActionTemplate')
  if (image.isEmpty()) throw new Error('oh-my-dsh desktop: macOS Tray image is unavailable')
  image.setTemplateImage(true)
  tray = new Tray(image)
  tray.on('click', showWindow)
  updateTray()
}

async function boot(): Promise<void> {
  registerIpc()
  createWindow()
  createTray()
  const registered = globalShortcut.register('CommandOrControl+Shift+Space', showWindow)
  if (!registered) console.warn('oh-my-dsh desktop: Cmd+Shift+Space could not be registered')
  powerMonitor.on('resume', () => { if (runtime === undefined && !isQuitting) void startRuntime() })
  powerMonitor.on('unlock-screen', () => { if (runtime === undefined && !isQuitting) void startRuntime() })
  await startRuntime()
}

const hasLock = app.requestSingleInstanceLock({ id: SINGLE_INSTANCE_LOCK })
if (!hasLock) {
  app.quit()
} else {
  app.on('second-instance', showWindow)
  app.on('activate', showWindow)
  app.on('before-quit', (event) => {
    if (isQuitting) return
    event.preventDefault()
    isQuitting = true
    void shutdown().then(() => { app.exit(0) })
  })
  app.on('window-all-closed', () => {})
  void app.whenReady().then(boot).catch((error: unknown) => {
    console.error('oh-my-dsh desktop: startup failed', error)
    app.exit(1)
  })
}
