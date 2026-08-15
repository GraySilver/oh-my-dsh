import { createRequire } from 'node:module'
import {
  cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync,
} from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const peerStage = join(desktopDirectory, '.runtime-peers')

function readManifest(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function isInside(directory, path) {
  const pathFromDirectory = relative(directory, path)
  return pathFromDirectory === ''
    || (pathFromDirectory !== '..' && !pathFromDirectory.startsWith(`..${sep}`) && !isAbsolute(pathFromDirectory))
}

function resolvePackageDirectory(anchor, packageName, modulesBoundary) {
  for (const searchPath of createRequire(anchor).resolve.paths(packageName) ?? []) {
    const candidate = join(searchPath, packageName)
    if (!existsSync(join(candidate, 'package.json'))) continue
    const resolved = realpathSync(candidate)
    if (isInside(modulesBoundary, resolved)) return resolved
  }
  return undefined
}

function containsNativeAddon(directory) {
  const pending = [directory]
  while (pending.length > 0) {
    const current = pending.pop()
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) pending.push(join(current, entry.name))
      else if (entry.isFile() && entry.name.endsWith('.node')) return true
    }
  }
  return false
}

export default function completeRuntimeDependencies(context) {
  const productFilename = context.packager.appInfo.productFilename
  const resources = join(resolve(context.appOutDir), `${productFilename}.app`, 'Contents', 'Resources')
  const appModules = join(resources, 'app', 'node_modules')
  const productManifestPath = join(appModules, '@graysilver', 'oh-my-dsh', 'package.json')
  const queue = [productManifestPath]
  const visited = new Set()
  const copied = []
  while (queue.length > 0) {
    const manifestPath = queue.shift()
    const manifest = readManifest(manifestPath)
    if (manifest.name !== undefined && visited.has(manifest.name)) continue
    if (manifest.name !== undefined) visited.add(manifest.name)
    const related = [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.peerDependencies ?? {})]
    for (const packageName of related) {
      if (visited.has(packageName)) continue
      let packageDirectory = resolvePackageDirectory(manifestPath, packageName, appModules)
      if (packageDirectory === undefined) {
        const staged = resolvePackageDirectory(
          join(peerStage, 'package.json'), packageName, join(peerStage, 'node_modules'),
        )
        if (staged === undefined) {
          if (manifest.peerDependenciesMeta?.[packageName]?.optional === true) continue
          throw new Error(`oh-my-dsh desktop: packaged runtime is missing ${packageName}`)
        }
        if (containsNativeAddon(staged)) {
          throw new Error(`oh-my-dsh desktop: runtime peer ${packageName} needs architecture-aware packaging`)
        }
        const target = join(appModules, packageName)
        mkdirSync(dirname(target), { recursive: true })
        cpSync(staged, target, { errorOnExist: true, force: false, recursive: true })
        packageDirectory = target
        copied.push(packageName)
      }
      queue.push(join(packageDirectory, 'package.json'))
    }
  }
  console.log(`oh-my-dsh desktop: completed ${context.arch} runtime with ${String(copied.length)} peer packages`)
}
