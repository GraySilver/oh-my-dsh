import { existsSync, lstatSync, readdirSync, symlinkSync, unlinkSync } from 'node:fs'
import { join, relative } from 'node:path'

const repositoryRoot = new URL('../../../', import.meta.url)
const pnpmStore = join(repositoryRoot.pathname, 'node_modules/.pnpm')
const sharpInstall = readdirSync(pnpmStore).find(name => name.startsWith('sharp@0.35.3_'))
if (sharpInstall === undefined) throw new Error('oh-my-dsh desktop: sharp is not installed')

const imageModules = join(pnpmStore, sharpInstall, 'node_modules/@img')
const required = ['sharp-darwin-x64', 'sharp-libvips-darwin-x64']
for (const name of required) {
  const targetName = readdirSync(pnpmStore).find(entry => entry.startsWith(`@img+${name}@`))
  if (targetName === undefined) throw new Error(`oh-my-dsh desktop: ${name} is not installed; run pnpm install for Universal builds`)
  const link = join(imageModules, name)
  if (existsSync(link) || lstatSync(link, { throwIfNoEntry: false }) !== undefined) {
    if (lstatSync(link).isSymbolicLink()) unlinkSync(link)
    else continue
  }
  symlinkSync(relative(imageModules, join(pnpmStore, targetName, 'node_modules/@img', name)), link)
}
