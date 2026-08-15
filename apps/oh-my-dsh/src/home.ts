import { homedir } from 'node:os'
import { resolve } from 'node:path'

/** Product-specific state root. It never shares the upstream default `~/.dsh`. */
export function resolveProductHome(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.OH_MY_DSH_HOME
  return resolve(configured === undefined || configured.trim() === ''
    ? resolve(homedir(), '.oh-my-dsh')
    : configured)
}
