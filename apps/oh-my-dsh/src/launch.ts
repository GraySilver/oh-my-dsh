import { type ChildProcess, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { healProfilesModuleFallback } from '@deepseek-ai/dsh-app-boot'
import {
  PRODUCT_LAN_PATCH_PATH, PRODUCT_MANIFEST_PATH, PRODUCT_PATCH_PATH,
} from './manifest.ts'
import { resolveProductHome } from './home.ts'

const READY_URL = /dsh web: (http:\/\/127\.0\.0\.1:\d+)/

/** Network bindings intentionally exposed by the product launcher. */
export type ProductWebHost = '127.0.0.1' | '0.0.0.0'

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

/** Resolve the published upstream executable used as the product engine. */
export function resolveUpstreamBin(): string {
  return `${dirname(packageManifest('@deepseek-ai/dsh'))}/lib/bin.js`
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

/** Await a child and forward shutdown signals without leaving an engine process behind. */
function awaitChild(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    let forwardedSignal: NodeJS.Signals | undefined
    const forward = (signal: NodeJS.Signals): void => {
      if (child.exitCode === null && child.signalCode === null) {
        forwardedSignal = signal
        child.kill(signal)
      }
    }
    const onInterrupt = (): void => { forward('SIGINT') }
    const onTerminate = (): void => { forward('SIGTERM') }
    process.on('SIGINT', onInterrupt)
    process.on('SIGTERM', onTerminate)
    const clean = (): void => {
      process.off('SIGINT', onInterrupt)
      process.off('SIGTERM', onTerminate)
    }
    child.once('error', (error) => { clean(); reject(error) })
    child.once('close', (code) => {
      clean()
      resolve(code ?? (forwardedSignal === 'SIGINT' ? 130 : 143))
    })
  })
}

/** Launch the upstream Web profile with the product layer and current-directory handoff. */
export async function launchWeb(
  cwd: string = process.cwd(),
  host: ProductWebHost = '127.0.0.1',
): Promise<number> {
  const home = resolveProductHome()
  healProfilesModuleFallback(PRODUCT_MANIFEST_PATH, home)

  const patches = host === '0.0.0.0'
    ? ['--patch', PRODUCT_PATCH_PATH, '--patch', PRODUCT_LAN_PATCH_PATH]
    : ['--patch', PRODUCT_PATCH_PATH]
  const child = spawn(process.execPath, [resolveUpstreamBin(), 'web', ...patches], {
    cwd,
    env: { ...process.env, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1' },
    stdio: ['inherit', 'pipe', 'inherit'],
  })
  let tail = ''
  let opened = false
  child.stdout.on('data', (chunk: Buffer) => {
    process.stdout.write(chunk)
    if (opened) return
    tail = `${tail}${chunk.toString('utf8')}`.slice(-2048)
    const match = READY_URL.exec(tail)
    if (match?.[1] === undefined) return
    opened = true
    const url = new URL(match[1])
    url.searchParams.set('cwd', cwd)
    openBrowser(url.href)
  })
  return awaitChild(child)
}
