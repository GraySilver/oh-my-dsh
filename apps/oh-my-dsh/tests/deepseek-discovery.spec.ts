import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiProxy } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { LlmDiscoveredModel, LlmModelDiscoveryRequest } from '@deepseek-ai/dsh-llm'
import { discoverDeepSeekModels } from '../src/deepseek-discovery.ts'
import {
  applyProductEnhancements, applyProductFullAccessRoutes, PRODUCT_FULL_ACCESS_METHODS,
} from '../src/index.ts'

const closers: Array<() => Promise<void>> = []

async function serve(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<string> {
  const server = createServer(handler)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      resolve()
    })
  })
  closers.push(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error === undefined) {
          resolve()
        } else {
          reject(error)
        }
      })
    })
  })
  const address = server.address() as AddressInfo
  return `http://127.0.0.1:${String(address.port)}/v1`
}

afterEach(async () => {
  await Promise.all(closers.splice(0).map(close => close()))
})

describe('the DeepSeek connection probe', () => {
  it('uses the unsaved key against the bounded model-list endpoint', async () => {
    const requests: Array<{ path: string | undefined; authorization: string | undefined }> = []
    const baseURL = await serve((request, response) => {
      requests.push({ path: request.url, authorization: request.headers.authorization })
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ data: [{ id: 'deepseek-chat' }, { id: '' }, { nope: true }] }))
    })

    await expect(discoverDeepSeekModels({ baseURL, apiKey: 'one-shot-secret' }, 2_000))
      .resolves.toEqual([{ id: 'deepseek-chat', name: 'deepseek-chat' }])
    expect(requests).toEqual([{
      path: '/v1/models',
      authorization: 'Bearer one-shot-secret',
    }])
  })

  it('reports an authentication failure without including the secret or body', async () => {
    const baseURL = await serve((_request, response) => {
      response.statusCode = 401
      response.end('secret-reflection')
    })

    const failure = await discoverDeepSeekModels({ baseURL, apiKey: 'private-key' }, 2_000)
      .then(() => '', (error: unknown) => String(error))
    expect(failure).toContain('HTTP 401')
    expect(failure).not.toContain('private-key')
    expect(failure).not.toContain('secret-reflection')
  })

  it('rejects empty, malformed, and oversized model-list responses', async () => {
    const invalid = await serve((_request, response) => {
      response.end('{')
    })
    await expect(discoverDeepSeekModels({ baseURL: invalid, apiKey: 'key' }, 2_000))
      .rejects.toThrow('invalid JSON')

    const empty = await serve((_request, response) => {
      response.end('{"data":[]}')
    })
    await expect(discoverDeepSeekModels({ baseURL: empty, apiKey: 'key' }, 2_000))
      .rejects.toThrow('no usable models')

    const oversized = await serve((_request, response) => {
      response.setHeader('content-length', '1000001')
      response.end('{}')
    })
    await expect(discoverDeepSeekModels({ baseURL: oversized, apiKey: 'key' }, 2_000))
      .rejects.toThrow('oversized')
  })
})

describe('the product Host plugin', () => {
  it('registers one DeepSeek discovery and serves the installed catalog without a draft key', async () => {
    let discovery: ((request: LlmModelDiscoveryRequest) => Promise<readonly unknown[]>) | undefined
    const registerModelDiscovery = vi.fn((
      settingsNs: string,
      callback: (request: LlmModelDiscoveryRequest) => Promise<readonly LlmDiscoveredModel[]>,
    ) => {
      expect(settingsNs).toBe('llm-deepseek')
      discovery = callback
      return () => {
        // Test disposer: registration has no external resource to release.
      }
    })
    const listModels = vi.fn(() => Promise.resolve([{
      provider: 'deepseek-official', id: 'deepseek-chat', name: 'DeepSeek Chat',
    }]))
    const tapIndex = vi.fn()

    applyProductEnhancements({
      llm: { registerModelDiscovery, listModels },
      webServer: { host: '127.0.0.1', tapIndex, register: vi.fn() },
      effect: vi.fn(),
    }, { connectionTimeoutMs: 10_000 })
    expect(registerModelDiscovery).toHaveBeenCalledTimes(1)
    expect(tapIndex).not.toHaveBeenCalled()
    if (discovery === undefined) {
      throw new Error('the product plugin did not register model discovery')
    }
    await expect(discovery({ provider: 'deepseek-official' }))
      .resolves.toEqual([{ id: 'deepseek-chat', name: 'DeepSeek Chat' }])
    expect(listModels).toHaveBeenCalledWith('deepseek-official')
  })

  it('installs a cryptographic UUID bootstrap before every LAN-served Web shell', () => {
    let transform: ((html: string) => string) | undefined
    const tapIndex = vi.fn((next: (html: string) => string) => {
      transform = next
      return () => {
        // Test disposer: the captured transform has no external resource.
      }
    })
    const effect = vi.fn((register: () => () => void) => {
      register()
    })
    const registerModelDiscovery = vi.fn(() => () => {
      // Test disposer: registration has no external resource to release.
    })
    applyProductEnhancements({
      llm: { registerModelDiscovery, listModels: vi.fn() },
      webServer: { host: '0.0.0.0', tapIndex, register: vi.fn() },
      effect,
    }, { connectionTimeoutMs: 10_000 })

    expect(effect).toHaveBeenCalledWith(expect.any(Function), 'oh-my-dsh: LAN UUID bootstrap')
    expect(tapIndex).toHaveBeenCalledTimes(1)
    if (transform === undefined) throw new Error('the LAN index transform was not registered')
    const result = transform('<html><head><script src="shell.js"></script></head></html>')
    expect(result).toContain('crypto.getRandomValues(new Uint8Array(16))')
    expect(result.indexOf('crypto.getRandomValues')).toBeLessThan(result.indexOf('shell.js'))
  })

  it('fails loud on an invalid timeout', () => {
    const context = {
      llm: { registerModelDiscovery: vi.fn(), listModels: vi.fn() },
      webServer: { host: '127.0.0.1' as const, tapIndex: vi.fn(), register: vi.fn() },
      effect: vi.fn(),
    }
    expect(() => {
      applyProductEnhancements(context, { connectionTimeoutMs: 0 })
    })
      .toThrow('connectionTimeoutMs')
    expect(context.llm.registerModelDiscovery).not.toHaveBeenCalled()
  })

  it('mounts exact widened routes without claiming the shared RPC interceptor', () => {
    const routes: WebRoute[] = []
    applyProductFullAccessRoutes({
      apiProxy: {} as ApiProxy,
      webServer: {
        host: '0.0.0.0',
        tapIndex: vi.fn(),
        register: vi.fn((route: WebRoute) => {
          routes.push(route)
          return () => {}
        }),
      },
      effect: vi.fn((register: () => () => void) => { register() }),
    }, { trustedHosts: ['192.168.1.6'] })

    expect(routes).toHaveLength(PRODUCT_FULL_ACCESS_METHODS.size)
    expect(routes.every(route => route.kind === 'exact')).toBe(true)
    expect(routes.map(route => route.path)).toContain('/api/settings.describe')
    expect(routes.map(route => route.path)).toContain('/api/credentials.set')
  })
})
