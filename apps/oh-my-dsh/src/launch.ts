import { type ChildProcess, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { healProfilesModuleFallback } from '@deepseek-ai/dsh-app-boot'
import {
  PRODUCT_LAN_PATCH_PATH, PRODUCT_MANIFEST_PATH, PRODUCT_PATCH_PATH,
} from './manifest.ts'
import { resolveProductHome } from './home.ts'

const READY_LINE = /dsh web: (http:\/\/127\.0\.0\.1:\d+)(?: \(LAN: (http:\/\/[^)\s]+)\))?/
const DEFAULT_WEB_PORT = 3080
const DEFAULT_READY_TIMEOUT_MS = 30_000
const STARTUP_OUTPUT_TAIL_LIMIT = 12_000

/** Network bindings intentionally exposed by the product launcher. */
export type ProductWebHost = '127.0.0.1' | '0.0.0.0'

/** The URL line emitted by the upstream web profile after it has bound its port. */
export interface WebReadyInfo {
  /** Loopback URL used by the embedded Desktop window or local browser. */
  localUrl: string
  /** LAN URL, present when the profile is listening on every IPv4 interface. */
  lanUrl?: string
}

/** The independent facts reported when a managed runtime exits. */
export interface WebRuntimeExit {
  /** Normal exit code, or `null` when the process ended by signal. */
  code: number | null
  /** Signal that terminated the child, or `null` for a normal exit. */
  signal: NodeJS.Signals | null
}

/** Options for starting the product-owned upstream web runtime. */
export interface StartWebRuntimeOptions {
  /** Directory handed to the WebUI as its initial workspace. */
  cwd?: string
  /** Network binding selected by the caller. */
  host?: ProductWebHost
  /** Fail before spawning when the product's fixed port is already occupied. */
  checkPortAvailability?: boolean
  /** Maximum time to wait for the upstream ready line. */
  readyTimeoutMs?: number
  /** Forward child output to a caller-owned sink. */
  onOutput?: (stream: 'stdout' | 'stderr', chunk: string) => void
  /** Forward process shutdown signals while the runtime is active. */
  forwardSignals?: boolean
  /** Cancel startup, terminate the child, and wait until it exits. */
  signal?: AbortSignal
}

/** Runtime handle used by both the CLI and the Electron main process. */
export interface ManagedWebRuntime {
  /** Child process owned by this handle. */
  readonly child: ChildProcess
  /** Loopback URL emitted by the web profile. */
  readonly localUrl: string
  /** LAN URL emitted by the web profile, when LAN mode is enabled. */
  readonly lanUrl?: string
  /** Host selected for this runtime. */
  readonly host: ProductWebHost
  /** Fixed product port. */
  readonly port: number
  /** Resolves only after the child process has actually exited. */
  readonly done: Promise<WebRuntimeExit>
  /** Request shutdown and wait until the child has exited. */
  stop(signal?: NodeJS.Signals): Promise<WebRuntimeExit>
}

/** Resolve a package directory without requiring it to export package.json. */
function packageManifest(packageName: string): string {
  const require = createRequire(PRODUCT_MANIFEST_PATH)
  for (const searchPath of require.resolve.paths(packageName) ?? []) {
    const candidate = `${searchPath}/${packageName}/package.json`
    try {
      return require.resolve(candidate)
    } catch {
      // Keep following Node's own package search order.
    }
  }
  throw new Error(`oh-my-dsh: cannot resolve ${packageName}; reinstall @graysilver/oh-my-dsh`)
}

function appendStartupOutput(tail: string, stream: 'stdout' | 'stderr', chunk: string): string {
  return `${tail}[${stream}] ${chunk}`.slice(-STARTUP_OUTPUT_TAIL_LIMIT)
}

function startupFailure(message: string, outputTail: string): Error {
  const detail = outputTail.trim()
  return new Error(detail === '' ? message : `${message}\n\nRecent runtime output:\n${detail}`)
}

/** Resolve the published upstream executable used as the product engine. */
export function resolveUpstreamBin(): string {
  return `${dirname(packageManifest('@deepseek-ai/dsh'))}/lib/bin.js`
}

/** Parse the stable URL line emitted by the upstream web profile. */
export function parseWebReady(text: string): WebReadyInfo | undefined {
  const match = READY_LINE.exec(text)
  if (match?.[1] === undefined) return undefined
  return match[2] === undefined
    ? { localUrl: match[1] }
    : { localUrl: match[1], lanUrl: match[2] }
}

/** Open a local URL with the operating system's default browser. */
function openBrowser(url: string): void {
  if (process.env.OH_MY_DSH_NO_OPEN !== undefined) return
  const command = process.platform === 'darwin'
    ? { file: 'open', args: [url] }
    : process.platform === 'win32'
      ? { file: 'cmd.exe', args: ['/d', '/s', '/c', 'start', '', url] }
      : { file: 'xdg-open', args: [url] }
  const opener = spawn(command.file, command.args, { detached: true, stdio: 'ignore' })
  opener.on('error', () => {})
  opener.unref()
}

/** Check the fixed product port without leaving a listener behind. */
async function assertPortAvailable(host: ProductWebHost): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const server = createServer()
    const finish = (error?: Error): void => {
      server.removeAllListeners()
      if (server.listening) {
        server.close(() => {
          if (error === undefined) resolve()
          else reject(error)
        })
      } else if (error === undefined) {
        resolve()
      } else {
        reject(error)
      }
    }
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        finish(new Error(`oh-my-dsh: port ${String(DEFAULT_WEB_PORT)} is already in use`))
      } else {
        finish(error)
      }
    })
    server.listen(DEFAULT_WEB_PORT, host, () => { finish() })
  })
}

/** Convert an exit result to the conventional shell status used by the CLI. */
function exitStatus(exit: WebRuntimeExit): number {
  if (exit.code !== null) return exit.code
  if (exit.signal === 'SIGINT') return 130
  if (exit.signal === 'SIGTERM') return 143
  return 1
}

function startupAbortError(signal: AbortSignal | undefined): Error {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException('The operation was aborted', 'AbortError')
}

/** Start the product Web profile and wait until its HTTP server is ready. */
export async function startWebRuntime(options: StartWebRuntimeOptions = {}): Promise<ManagedWebRuntime> {
  const cwd = options.cwd ?? process.cwd()
  const host = options.host ?? '127.0.0.1'
  const readyTimeoutMs = options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS
  if (!Number.isSafeInteger(readyTimeoutMs) || readyTimeoutMs <= 0) {
    throw new Error('oh-my-dsh: readyTimeoutMs must be a positive safe integer')
  }
  options.signal?.throwIfAborted()
  if (options.checkPortAvailability === true) await assertPortAvailable(host)
  options.signal?.throwIfAborted()

  const home = resolveProductHome()
  healProfilesModuleFallback(PRODUCT_MANIFEST_PATH, home)
  const patches = host === '0.0.0.0'
    ? ['--patch', PRODUCT_PATCH_PATH, '--patch', PRODUCT_LAN_PATCH_PATH]
    : ['--patch', PRODUCT_PATCH_PATH]
  const child = spawn(process.execPath, [resolveUpstreamBin(), 'web', ...patches], {
    cwd,
    env: {
      ...process.env,
      DSH_HOME: home,
      DSH_TELEMETRY_DISABLED: '1',
      ...(process.versions.electron === undefined ? {} : { ELECTRON_RUN_AS_NODE: '1' }),
    },
    stdio: ['inherit', 'pipe', 'pipe'],
  })
  const onOutput = options.onOutput ?? ((stream, chunk) => {
    if (stream === 'stdout') process.stdout.write(chunk)
    else process.stderr.write(chunk)
  })
  let startupOutputTail = ''
  const dispatchOutput = (stream: 'stdout' | 'stderr', chunk: Buffer): void => {
    const text = chunk.toString('utf8')
    startupOutputTail = appendStartupOutput(startupOutputTail, stream, text)
    try {
      onOutput(stream, text)
    } catch (error) {
      console.warn('oh-my-dsh: output listener failed', error)
    }
  }
  child.stdout.on('data', (chunk: Buffer) => { dispatchOutput('stdout', chunk) })
  child.stderr.on('data', (chunk: Buffer) => { dispatchOutput('stderr', chunk) })

  let resolveDone!: (exit: WebRuntimeExit) => void
  const done = new Promise<WebRuntimeExit>((resolve) => { resolveDone = resolve })
  let signalForwarding = options.forwardSignals === true
  const forward = (signal: NodeJS.Signals): void => {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal)
  }
  const onInterrupt = (): void => { forward('SIGINT') }
  const onTerminate = (): void => { forward('SIGTERM') }
  if (signalForwarding) {
    process.on('SIGINT', onInterrupt)
    process.on('SIGTERM', onTerminate)
  }
  child.once('close', (code, signal) => {
    signalForwarding = false
    process.off('SIGINT', onInterrupt)
    process.off('SIGTERM', onTerminate)
    resolveDone({ code, signal })
  })

  let stopPromise: Promise<WebRuntimeExit> | undefined
  const stop = (signal: NodeJS.Signals = 'SIGTERM'): Promise<WebRuntimeExit> => {
    if (stopPromise !== undefined) return stopPromise
    stopPromise = (async () => {
      if (child.exitCode === null && child.signalCode === null) child.kill(signal)
      return await done
    })()
    return stopPromise
  }

  const ready = await new Promise<WebReadyInfo>((resolve, reject) => {
    let tail = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(startupFailure(
        `oh-my-dsh: web runtime did not become ready within ${String(readyTimeoutMs)}ms`,
        startupOutputTail,
      ))
    }, readyTimeoutMs)
    timer.unref()
    const finish = (callback: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.stdout.off('data', onStdout)
      child.off('error', onError)
      child.off('close', onClose)
      options.signal?.removeEventListener('abort', onAbort)
      callback()
    }
    const onStdout = (chunk: Buffer): void => {
      tail = `${tail}${chunk.toString('utf8')}`.slice(-4096)
      const info = parseWebReady(tail)
      if (info !== undefined) finish(() => { resolve(info) })
    }
    const onError = (error: Error): void => {
      finish(() => { reject(startupFailure(error.message, startupOutputTail)) })
    }
    const onClose = (code: number | null, signal: NodeJS.Signals | null): void => {
      finish(() => {
        reject(startupFailure(
          `oh-my-dsh: web runtime exited before ready (code=${String(code)}, signal=${String(signal)})`,
          startupOutputTail,
        ))
      })
    }
    const onAbort = (): void => {
      finish(() => { reject(startupAbortError(options.signal)) })
    }
    child.stdout.on('data', onStdout)
    child.once('error', onError)
    child.once('close', onClose)
    options.signal?.addEventListener('abort', onAbort, { once: true })
    if (options.signal?.aborted === true) onAbort()
  }).catch(async (error: unknown) => {
    await stop('SIGTERM')
    throw error
  })

  const runtime: ManagedWebRuntime = {
    child,
    localUrl: ready.localUrl,
    ...(ready.lanUrl === undefined ? {} : { lanUrl: ready.lanUrl }),
    host,
    port: DEFAULT_WEB_PORT,
    done,
    stop,
  }
  return runtime
}

/** Launch the upstream Web profile and open the ready URL in the system browser. */
export async function launchWeb(
  cwd: string = process.cwd(),
  host: ProductWebHost = '127.0.0.1',
): Promise<number> {
  const runtime = await startWebRuntime({ cwd, host, forwardSignals: true })
  const url = new URL(runtime.localUrl)
  url.searchParams.set('cwd', cwd)
  openBrowser(url.href)
  return exitStatus(await runtime.done)
}
