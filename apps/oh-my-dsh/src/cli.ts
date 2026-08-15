import { formatDoctor, runDoctor } from './doctor.ts'
import { launchWeb, type ProductWebHost } from './launch.ts'
import { readProductManifest } from './manifest.ts'

/** The deliberately small public interface of the Web-only product. */
export type Invocation =
  | { mode: 'launch'; host: ProductWebHost }
  | { mode: 'doctor'; json: boolean; model: boolean }
  | { mode: 'help' }
  | { mode: 'version' }
  | { mode: 'error'; message: string }

export const HELP = `Oh My DSH — DeepSeek Harness, ready in the browser

Usage:
  oh-my-dsh                    launch the local Web app and open this directory
  oh-my-dsh --host 0.0.0.0     explicitly allow access from the local network
  oh-my-dsh doctor [--model]   check the local runtime and optional model route
  oh-my-dsh doctor --json      emit the stable diagnostic JSON schema
  oh-my-dsh --help             show this help
  oh-my-dsh --version          show product and upstream versions

Oh My DSH is Web-only. Profiles, headless runs, plugin management, and raw
Harness flags are intentionally not part of this product interface.
`

/** Parse only launch, help, version, and doctor; all upstream CLI surfaces stay private. */
export function parseInvocation(argv: readonly string[]): Invocation {
  if (argv.length === 0) return { mode: 'launch', host: '127.0.0.1' }
  if (argv.length === 2 && argv[0] === '--host') {
    if (argv[1] === '127.0.0.1' || argv[1] === '0.0.0.0') {
      return { mode: 'launch', host: argv[1] }
    }
    return { mode: 'error', message: `Unsupported host: ${String(argv[1])}` }
  }
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) return { mode: 'help' }
  if (argv.length === 1 && (argv[0] === '--version' || argv[0] === '-V')) return { mode: 'version' }
  if (argv[0] !== 'doctor') {
    return { mode: 'error', message: `Unknown command or option: ${argv.join(' ')}` }
  }
  const flags = argv.slice(1)
  const unknown = flags.filter(flag => flag !== '--json' && flag !== '--model')
  if (unknown.length > 0) return { mode: 'error', message: `Unknown doctor option: ${unknown.join(' ')}` }
  return { mode: 'doctor', json: flags.includes('--json'), model: flags.includes('--model') }
}

/** Execute one parsed invocation and return its process exit code. */
export async function runCli(argv: readonly string[]): Promise<number> {
  const invocation = parseInvocation(argv)
  if (invocation.mode === 'help') {
    process.stdout.write(HELP)
    return 0
  }
  if (invocation.mode === 'version') {
    const manifest = readProductManifest()
    process.stdout.write(`${manifest.version}\n`)
    return 0
  }
  if (invocation.mode === 'error') {
    process.stderr.write(`oh-my-dsh: ${invocation.message}\n\n${HELP}`)
    return 2
  }
  if (invocation.mode === 'launch') return await launchWeb(process.cwd(), invocation.host)
  const report = await runDoctor({ model: invocation.model })
  process.stdout.write(invocation.json ? `${JSON.stringify(report, undefined, 2)}\n` : formatDoctor(report))
  return report.ok ? 0 : 1
}
