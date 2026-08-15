import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseInvocation } from '../src/cli.ts'
import { supportedNode } from '../src/doctor.ts'
import { resolveUpstreamBin } from '../src/launch.ts'
import { PRODUCT_LAN_PATCH_PATH, PRODUCT_PATCH_PATH } from '../src/manifest.ts'

describe('the Web-only public interface', () => {
  it('launches the Web product with no arguments', () => {
    expect(parseInvocation([])).toEqual({ mode: 'launch', host: '127.0.0.1' })
  })

  it('requires an explicit supported host before exposing the Web product', () => {
    expect(parseInvocation(['--host', '0.0.0.0']))
      .toEqual({ mode: 'launch', host: '0.0.0.0' })
    expect(parseInvocation(['--host', 'example.com']).mode).toBe('error')
  })

  it('accepts only bounded doctor flags', () => {
    expect(parseInvocation(['doctor', '--json', '--model']))
      .toEqual({ mode: 'doctor', json: true, model: true })
    expect(parseInvocation(['doctor', '--profile', 'headless']).mode).toBe('error')
  })

  it.each(['run', 'headless', 'plugin', 'web', '--profile'])(
    'does not expose the upstream %s surface', (argument) => {
      expect(parseInvocation([argument]).mode).toBe('error')
    },
  )
})

describe('the Node support floor', () => {
  it('accepts 22.19 and 24+, but not older Node releases', () => {
    expect(supportedNode('v22.19.0')).toBe(true)
    expect(supportedNode('v24.0.0')).toBe(true)
    expect(supportedNode('v25.8.0')).toBe(true)
    expect(supportedNode('v26.1.0')).toBe(true)
    expect(supportedNode('v22.18.0')).toBe(false)
    expect(supportedNode('v20.20.0')).toBe(false)
  })
})

describe('the published upstream composition', () => {
  it('disables the upstream product rows and inserts the Oh My DSH replacements', () => {
    const home = mkdtempSync(join(tmpdir(), 'oh-my-dsh-config-'))
    try {
      const result = spawnSync(
        process.execPath,
        [resolveUpstreamBin(), 'web', '--patch', PRODUCT_PATCH_PATH, '--dump-config'],
        { encoding: 'utf8', env: { ...process.env, DSH_HOME: home } },
      )

      expect(result.status, result.stderr).toBe(0)
      expect(result.stderr).not.toContain('name mismatch')
      expect(result.stdout).toMatch(
        /- id: ui-settings-models\n  name: '@deepseek-ai\/dsh-client-ui-settings-models'\n  disabled: true/,
      )
      expect(result.stdout).toMatch(
        /- id: ui-agent-preset\n  name: '@deepseek-ai\/dsh-client-ui-agent-preset'\n  disabled: true/,
      )
      expect(result.stdout).toMatch(
        /- id: connection\n  name: '@deepseek-ai\/dsh-client-connection'[\s\S]*?disabled: true/,
      )
      expect(result.stdout).toContain("- id: oh-my-dsh-models\n  name: '@graysilver/oh-my-dsh-models'")
      expect(result.stdout).toContain("- id: oh-my-dsh-task-modes\n  name: '@graysilver/oh-my-dsh-task-modes'")
      expect(result.stdout).toContain(
        "- id: oh-my-dsh-product\n  name: '@graysilver/oh-my-dsh'\n  inject:\n    - webRuntime\n  config:\n    connectionTimeoutMs: 10000\n    trustedHosts: !!js ctx.webRuntime.trustedHosts",
      )
    } finally {
      rmSync(home, { force: true, recursive: true })
    }
  })

  it('overrides only the Web server host for an explicit LAN launch', () => {
    const home = mkdtempSync(join(tmpdir(), 'oh-my-dsh-lan-config-'))
    try {
      const result = spawnSync(
        process.execPath,
        [
          resolveUpstreamBin(), 'web', '--patch', PRODUCT_PATCH_PATH,
          '--patch', PRODUCT_LAN_PATCH_PATH, '--dump-config',
        ],
        { encoding: 'utf8', env: { ...process.env, DSH_HOME: home } },
      )

      expect(result.status, result.stderr).toBe(0)
      expect(result.stderr).not.toContain('name mismatch')
      expect(result.stdout).toMatch(
        /- id: webserver\n  name: '@deepseek-ai\/dsh-host-webserver'[\s\S]*?host: 0\.0\.0\.0\n    port: 3080/,
      )
    } finally {
      rmSync(home, { force: true, recursive: true })
    }
  })
})
