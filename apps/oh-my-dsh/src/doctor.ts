import { randomUUID } from 'node:crypto'
import { constants, existsSync } from 'node:fs'
import { access, mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import * as yaml from 'js-yaml'
import { PRODUCT_MANIFEST_PATH, PRODUCT_PATCH_PATH, readProductManifest } from './manifest.ts'
import { resolveProductHome } from './home.ts'

export type CheckStatus = 'pass' | 'warn' | 'fail'

/** One stable, machine-readable doctor result. */
export interface DoctorCheck {
  id: string
  status: CheckStatus
  summary: string
  fix?: string
}

/** Versioned diagnostic schema for automation and support bundles. */
export interface DoctorReport {
  schemaVersion: 1
  ok: boolean
  versions: {
    ohMyDsh: string
    dsh: string
    upstreamCommit: string
    node: string
  }
  home: string
  checks: DoctorCheck[]
}

/** Whether the current Node version satisfies the upstream runtime floor. */
export function supportedNode(version: string): boolean {
  const [major = 0, minor = 0] = version.replace(/^v/, '').split('.').map(Number)
  return major >= 24 || (major === 22 && minor >= 19)
}

function pass(id: string, summary: string): DoctorCheck {
  return { id, status: 'pass', summary }
}

function fail(id: string, summary: string, fix: string): DoctorCheck {
  return { id, status: 'fail', summary, fix }
}

function warn(id: string, summary: string, fix: string): DoctorCheck {
  return { id, status: 'warn', summary, fix }
}

function readUpstreamVersion(): string {
  const require = createRequire(PRODUCT_MANIFEST_PATH)
  try {
    const manifest = require('@deepseek-ai/dsh/package.json') as { version?: unknown }
    return typeof manifest.version === 'string' ? manifest.version : 'unknown'
  } catch {
    return 'missing'
  }
}

async function writableDirectory(id: string, path: string): Promise<DoctorCheck> {
  try {
    await mkdir(path, { recursive: true })
    await access(path, constants.R_OK | constants.W_OK)
    const probe = join(path, `.oh-my-dsh-doctor-${randomUUID()}`)
    await writeFile(probe, '')
    await unlink(probe)
    return pass(id, `${path} is readable and writable`)
  } catch (error) {
    return fail(id, `${path} is not usable: ${String(error)}`, `Grant read/write access to ${path}.`)
  }
}

async function portAvailable(port: number): Promise<DoctorCheck> {
  return await new Promise((resolve) => {
    const server = createServer()
    server.once('error', (error) => {
      resolve(fail('port', `127.0.0.1:${port} is unavailable: ${String(error)}`, `Stop the process using port ${port}, then retry.`))
    })
    server.listen(port, '127.0.0.1', () => {
      server.close((error) => {
        resolve(error === undefined
          ? pass('port', `127.0.0.1:${port} is available`)
          : fail('port', `Could not release the port probe: ${String(error)}`, 'Retry after checking local networking.'))
      })
    })
  })
}

function credentialFromDocument(value: unknown): string | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const key = (value as Record<string, unknown>).DEEPSEEK_API_KEY
  return typeof key === 'string' && key.trim() !== '' ? key : undefined
}

async function readCredential(home: string): Promise<string | undefined> {
  if (process.env.DEEPSEEK_API_KEY?.trim()) return process.env.DEEPSEEK_API_KEY
  try {
    return credentialFromDocument(yaml.load(await readFile(join(home, '.credentials.yaml'), 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

async function credentialCheck(home: string, probeModel: boolean): Promise<DoctorCheck> {
  let key: string | undefined
  try {
    key = await readCredential(home)
  } catch (error) {
    return fail('credential', `Credential file could not be read: ${String(error)}`, 'Repair or remove the malformed .credentials.yaml file.')
  }
  if (key === undefined) {
    return probeModel
      ? fail('model', 'No DeepSeek API key is configured.', 'Launch Oh My DSH and complete the connection dialog first.')
      : warn('credential', 'No DeepSeek API key is configured yet.', 'Launch Oh My DSH and complete the connection dialog.')
  }
  if (!probeModel) return pass('credential', 'DeepSeek credentials are configured (secret hidden)')

  const base = process.env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com'
  try {
    const response = await fetch(`${base.replace(/\/$/, '')}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      return fail('model', `DeepSeek model discovery returned HTTP ${response.status}.`, 'Check the API key, base URL, network, and account status.')
    }
    const body = await response.json() as { data?: unknown[] }
    return pass('model', `DeepSeek model discovery succeeded (${body.data?.length ?? 0} models)`)
  } catch (error) {
    return fail('model', `DeepSeek model discovery failed: ${String(error)}`, 'Check DNS, proxy, TLS, and DEEPSEEK_BASE_URL, then retry.')
  }
}

/** Run bounded environment checks without printing or exposing credentials. */
export async function runDoctor(options: { model: boolean; cwd?: string } = { model: false }): Promise<DoctorReport> {
  const product = readProductManifest()
  const home = resolveProductHome()
  const cwd = options.cwd ?? process.cwd()
  const dsh = readUpstreamVersion()
  const checks: DoctorCheck[] = []
  checks.push(supportedNode(process.version)
    ? pass('node', `Node ${process.version} is supported`)
    : fail('node', `Node ${process.version} is unsupported`, 'Install Node 22.19 or a current release (24+).'))
  checks.push(dsh === product.ohMyDsh.upstreamPackage
    ? pass('engine', `Upstream engine ${dsh} matches the product lock`)
    : fail('engine', `Upstream engine is ${dsh}; expected ${product.ohMyDsh.upstreamPackage}`, 'Reinstall @graysilver/oh-my-dsh from one release artifact.'))
  checks.push(existsSync(PRODUCT_PATCH_PATH)
    ? pass('product-patch', 'The product Web composition layer is present')
    : fail('product-patch', `Missing ${PRODUCT_PATCH_PATH}`, 'Reinstall @graysilver/oh-my-dsh.'))
  checks.push(await writableDirectory('home', home))
  try {
    await access(cwd, constants.R_OK | constants.W_OK)
    checks.push(pass('workspace', `${cwd} is readable and writable`))
  } catch (error) {
    checks.push(fail('workspace', `${cwd} is not usable: ${String(error)}`, 'Launch from a readable, writable project directory.'))
  }
  checks.push(await portAvailable(3080))
  checks.push(await credentialCheck(home, options.model))

  return {
    schemaVersion: 1,
    ok: checks.every(check => check.status !== 'fail'),
    versions: {
      ohMyDsh: product.version,
      dsh,
      upstreamCommit: product.ohMyDsh.upstreamCommit,
      node: process.version,
    },
    home,
    checks,
  }
}

/** Format a human diagnostic while keeping JSON as the stable automation contract. */
export function formatDoctor(report: DoctorReport): string {
  const chinese = /(^|[_.-])zh([_.-]|$)/i.test(process.env.LANG ?? '')
  const lines = [
    `Oh My DSH ${report.versions.ohMyDsh} · DeepSeek Harness ${report.versions.dsh}`,
    `${chinese ? '数据目录' : 'Data home'}: ${report.home}`,
    '',
  ]
  for (const check of report.checks) {
    const marker = check.status === 'pass' ? '✓' : check.status === 'warn' ? '!' : '✗'
    lines.push(`${marker} ${check.summary}`)
    if (check.fix !== undefined) lines.push(`  ${chinese ? '处理' : 'Fix'}: ${check.fix}`)
  }
  lines.push('', report.ok
    ? (chinese ? '诊断通过。' : 'Doctor passed.')
    : (chinese ? '诊断发现阻塞项。' : 'Doctor found blocking checks.'))
  return `${lines.join('\n')}\n`
}
