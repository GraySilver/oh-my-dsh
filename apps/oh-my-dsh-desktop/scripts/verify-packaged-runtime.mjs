import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const applicationDirectory = join(packageDirectory, 'release', 'mac-universal', 'OhMyDSH.app')
const executable = join(applicationDirectory, 'Contents', 'MacOS', 'OhMyDSH')
const launchModule = join(
  applicationDirectory,
  'Contents',
  'Resources',
  'app',
  'node_modules',
  '@graysilver',
  'oh-my-dsh',
  'lib',
  'launch.js',
)

if (!existsSync(executable)) {
  throw new Error(`oh-my-dsh desktop: packaged executable is missing: ${executable}`)
}

const smokeSource = `
const runtime = await import(${JSON.stringify(pathToFileURL(launchModule).href)})
const managed = await runtime.startWebRuntime({
  cwd: process.env.OH_MY_DSH_SMOKE_CWD,
  host: '0.0.0.0',
  checkPortAvailability: true,
  readyTimeoutMs: 60_000,
  forwardSignals: false,
  onOutput: (stream, chunk) => {
    if (stream === 'stderr') process.stderr.write(chunk)
  },
})
try {
  const response = await fetch(managed.localUrl)
  const html = await response.text()
  if (!response.ok || !html.includes('<!doctype html>')) {
    throw new Error('packaged WebUI did not return its HTML entry')
  }
  process.stdout.write(JSON.stringify({
    localUrl: managed.localUrl,
    lanUrl: managed.lanUrl,
    pid: managed.child.pid,
  }) + '\\n')
} finally {
  await managed.stop()
}
`

const smokeRoot = mkdtempSync(join(tmpdir(), 'oh-my-dsh-packaged-smoke-'))
try {
  const smoke = spawnSync(executable, ['--input-type=module', '--eval', smokeSource], {
    encoding: 'utf8',
    timeout: 90_000,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      OH_MY_DSH_HOME: join(smokeRoot, 'home'),
      OH_MY_DSH_SMOKE_CWD: smokeRoot,
    },
  })
  if (smoke.error !== undefined) throw smoke.error
  if (smoke.status !== 0) {
    process.stdout.write(smoke.stdout)
    process.stderr.write(smoke.stderr)
    throw new Error(`oh-my-dsh desktop: packaged runtime smoke failed with status ${String(smoke.status)}`)
  }
  process.stdout.write(smoke.stdout)
} finally {
  rmSync(smokeRoot, { force: true, recursive: true })
}

console.log('oh-my-dsh desktop: packaged Web runtime smoke passed')
