import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import {
  existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const productManifestPath = join(desktopDirectory, '..', 'oh-my-dsh', 'package.json')
const stageDirectory = join(desktopDirectory, '.runtime-peers')

function readManifest(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function resolvePackageDirectory(anchor, packageName) {
  for (const searchPath of createRequire(anchor).resolve.paths(packageName) ?? []) {
    const candidate = join(searchPath, packageName)
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate)
  }
  throw new Error(`oh-my-dsh desktop: cannot resolve ${packageName} from ${anchor}`)
}

function runtimePeerDependencies() {
  const productManifest = readManifest(productManifestPath)
  const upstreamVersion = productManifest.ohMyDsh.upstreamPackage
  const dependencyNames = new Set()
  const peerRanges = new Map()
  const queue = [productManifestPath]
  while (queue.length > 0) {
    const manifestPath = queue.shift()
    const manifest = readManifest(manifestPath)
    if (manifest.name !== undefined && dependencyNames.has(manifest.name)) continue
    if (manifest.name !== undefined) dependencyNames.add(manifest.name)
    for (const [packageName, range] of Object.entries(manifest.peerDependencies ?? {})) {
      if (manifest.peerDependenciesMeta?.[packageName]?.optional === true || range.startsWith('workspace:')) continue
      const selected = packageName.startsWith('@deepseek-ai/dsh-') && range.includes(upstreamVersion)
        ? upstreamVersion
        : range
      const ranges = peerRanges.get(packageName) ?? new Set()
      ranges.add(selected)
      peerRanges.set(packageName, ranges)
    }
    for (const packageName of Object.keys(manifest.dependencies ?? {})) {
      if (dependencyNames.has(packageName)) continue
      queue.push(join(resolvePackageDirectory(manifestPath, packageName), 'package.json'))
    }
  }
  for (const packageName of dependencyNames) peerRanges.delete(packageName)
  const dependencies = []
  for (const [packageName, ranges] of peerRanges) {
    if (ranges.size !== 1) {
      throw new Error(`oh-my-dsh desktop: incompatible peer ranges for ${packageName}: ${[...ranges].join(' and ')}`)
    }
    dependencies.push([packageName, [...ranges][0]])
  }
  return Object.fromEntries(dependencies.sort(([left], [right]) => left.localeCompare(right)))
}

rmSync(stageDirectory, { force: true, recursive: true })
mkdirSync(stageDirectory, { recursive: true })
const dependencies = runtimePeerDependencies()
writeFileSync(join(stageDirectory, 'package.json'), `${JSON.stringify({
  name: 'oh-my-dsh-desktop-runtime-peers',
  private: true,
  version: '0.0.0',
  dependencies,
}, undefined, 2)}\n`)

const install = spawnSync('pnpm', [
  'install', '--prod', '--ignore-scripts', '--ignore-workspace', '--no-frozen-lockfile', '--no-lockfile',
  '--config.node-linker=hoisted',
], { cwd: stageDirectory, encoding: 'utf8' })
if (install.error !== undefined) throw install.error
if (install.status !== 0) {
  process.stdout.write(install.stdout)
  process.stderr.write(install.stderr)
  throw new Error(`oh-my-dsh desktop: runtime peer installation failed with status ${String(install.status)}`)
}
console.log(`oh-my-dsh desktop: prepared ${String(Object.keys(dependencies).length)} runtime peer roots`)
