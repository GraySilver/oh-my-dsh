import { describe, expect, it } from 'vitest'
import { parseWebReady, startWebRuntime } from '../src/launch.ts'

describe('oh-my-dsh web launcher', () => {
  it('parses loopback and LAN URLs from the upstream ready line', () => {
    expect(parseWebReady('dsh web: http://127.0.0.1:3080 (LAN: http://192.168.1.10:3080)')).toEqual({
      localUrl: 'http://127.0.0.1:3080',
      lanUrl: 'http://192.168.1.10:3080',
    })
  })

  it('parses a loopback-only ready line', () => {
    expect(parseWebReady('dsh web: http://127.0.0.1:3080')).toEqual({
      localUrl: 'http://127.0.0.1:3080',
    })
  })

  it('ignores unrelated output', () => {
    expect(parseWebReady('server is still starting')).toBeUndefined()
  })

  it('does not spawn a runtime for an already-aborted startup', async () => {
    await expect(startWebRuntime({ signal: AbortSignal.abort() })).rejects.toMatchObject({ name: 'AbortError' })
  })
})
