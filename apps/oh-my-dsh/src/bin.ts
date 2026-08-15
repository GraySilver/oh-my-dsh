#!/usr/bin/env node
/** Public executable for the Web-only Oh My DSH product. */

import { runCli } from './cli.ts'

try {
  process.exitCode = await runCli(process.argv.slice(2))
} catch (error) {
  process.stderr.write(`oh-my-dsh: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 2
}
