import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { apply, inject } from '../src/client/index.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the product browser connection', () => {
  it('reuses the upstream transport but grants a LAN page localhost-equivalent UI capabilities', () => {
    vi.stubGlobal('location', {
      hostname: '192.168.1.6',
      search: '',
    })
    let connection: ConnectionHandle | undefined
    apply({
      provide(name: string, value: unknown) {
        expect(name).toBe('connection')
        connection = value as ConnectionHandle
      },
    } as never)

    expect(inject).toEqual([])
    expect(connection).toBeDefined()
    expect(connection?.isLoopback).toBe(true)
    expect(connection?.api.settings).toHaveProperty('describe')
    expect(connection?.rpc).toHaveProperty('call')
    expect(connection).toHaveProperty('start')
  })
})
