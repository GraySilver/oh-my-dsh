import type { Context } from '@deepseek-ai/cordis'
import {
  apply as applyUpstreamConnection,
  type ConnectionConfig,
} from '@deepseek-ai/dsh-client-connection'
import { toFetchHandler } from '@deepseek-ai/dsh-host-apiproxy'
import type { ApiProxy } from '@deepseek-ai/dsh-host-apiproxy/api'
import type {
  LlmDiscoveredModel, LlmModelDiscoveryRequest, LlmModelInfo,
} from '@deepseek-ai/dsh-llm'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import {
  bridge, DEFAULT_MAX_REQUEST_BODY_BYTES,
} from '@graysilver/oh-my-dsh-upstream-connection-bridge'
import { isTrustedApiRequest } from '@graysilver/oh-my-dsh-upstream-connection-trust'
import { discoverDeepSeekModels } from './deepseek-discovery.ts'

const DEEPSEEK_PROVIDER = 'deepseek-official'
const DEEPSEEK_SETTINGS_NAMESPACE = 'llm-deepseek'
const LAN_UUID_BOOTSTRAP = [
  '<script>(()=>{',
  'if(typeof crypto.randomUUID==="function")return;',
  'Object.defineProperty(crypto,"randomUUID",{configurable:true,value:()=>{',
  'const bytes=crypto.getRandomValues(new Uint8Array(16));',
  'bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;',
  'const hex=Array.from(bytes,byte=>byte.toString(16).padStart(2,"0")).join("");',
  'return hex.slice(0,8)+"-"+hex.slice(8,12)+"-"+hex.slice(12,16)+"-"+hex.slice(16,20)+"-"+hex.slice(20);',
  '}});})()</script>',
].join('')

/** Configuration for the Oh My DSH Host product layer. */
export interface Config {
  /** Maximum time spent testing an unsaved DeepSeek credential. */
  connectionTimeoutMs: number
  /** LAN authorities derived by the upstream Web runtime for this bind. */
  trustedHosts: string[]
  /** Maximum buffered JSON body, kept aligned with the upstream connection. */
  maxRequestBodyBytes?: number
}

/** Upstream configuration-plane methods Oh My DSH deliberately exposes to trusted LAN clients. */
export const PRODUCT_FULL_ACCESS_METHODS: ReadonlySet<string> = new Set([
  'agentPreset.read',
  'agentPreset.copy',
  'agentPreset.openDocument',
  'agentPreset.remove',
  'host.pickDirectory',
  'host.openPath',
  'settings.describe',
  'settings.openDocument',
  'settings.update',
  'settings.replace',
  'settings.mutate',
  'credentials.describe',
  'credentials.set',
  'credentials.unset',
  'llm.discoverModels',
])

interface ProductLlmRuntime {
  registerModelDiscovery(
    settingsNs: string,
    discover: (request: LlmModelDiscoveryRequest) => Promise<readonly LlmDiscoveredModel[]>,
  ): () => void
  listModels(provider: string): Promise<readonly LlmModelInfo[]>
}

interface ProductContext {
  apiProxy: ApiProxy
  llm: ProductLlmRuntime
  webServer: {
    host: '127.0.0.1' | '0.0.0.0'
    register(route: WebRoute): () => void
    tapIndex(transform: (html: string) => string): () => void
  }
  effect(register: () => () => void, label: string): unknown
}

/** Service required by the product Host plugin. */
export const inject = ['apiProxy', 'llm', 'webServer']

/** Insert a getRandomValues-backed UUID v4 adapter before shell scripts on non-secure LAN HTTP. */
function injectLanUuidBootstrap(html: string): string {
  const head = html.indexOf('<head>')
  if (head === -1) return `${LAN_UUID_BOOTSTRAP}${html}`
  return `${html.slice(0, head + 6)}${LAN_UUID_BOOTSTRAP}${html.slice(head + 6)}`
}

/**
 * Mount exact routes for the upstream configuration plane. Exact routes win
 * over Connection's `/api` prefix, so the product changes the trust policy
 * without consuming Connection's single shared RPC interceptor (which remains
 * available to the upstream Typert gateway and future compatible features).
 */
export function applyProductFullAccessRoutes(
  ctx: Pick<ProductContext, 'apiProxy' | 'webServer' | 'effect'>,
  config: Pick<Config, 'trustedHosts' | 'maxRequestBodyBytes'>,
): void {
  const upstream = toFetchHandler(ctx.apiProxy)
  const maxRequestBodyBytes = config.maxRequestBodyBytes ?? DEFAULT_MAX_REQUEST_BODY_BYTES
  for (const method of PRODUCT_FULL_ACCESS_METHODS) {
    const route: WebRoute = {
      kind: 'exact',
      path: `/api/${method}`,
      handler: async (request, response) => {
        if (!isTrustedApiRequest(request, config.trustedHosts)) {
          response.writeHead(403)
          response.end('forbidden')
          return
        }
        await bridge(request, response, upstream, maxRequestBodyBytes)
      },
    }
    ctx.effect(
      () => ctx.webServer.register(route),
      `oh-my-dsh: trusted-host ${route.path}`,
    )
  }
}

/** Apply the product-owned discovery and insecure-context browser bootstrap. */
export function applyProductEnhancements(
  ctx: Pick<ProductContext, 'llm' | 'webServer' | 'effect'>,
  config: Pick<Config, 'connectionTimeoutMs'>,
): void {
  if (
    !Number.isSafeInteger(config.connectionTimeoutMs)
    || config.connectionTimeoutMs <= 0
    || config.connectionTimeoutMs > 2_147_483_647
  ) {
    throw new Error('oh-my-dsh: connectionTimeoutMs must be a positive safe timer duration')
  }
  if (ctx.webServer.host === '0.0.0.0') {
    ctx.effect(
      () => ctx.webServer.tapIndex(injectLanUuidBootstrap),
      'oh-my-dsh: LAN UUID bootstrap',
    )
  }
  ctx.llm.registerModelDiscovery(DEEPSEEK_SETTINGS_NAMESPACE, async (request) => {
    if (request.apiKey !== undefined) {
      return discoverDeepSeekModels(request, config.connectionTimeoutMs)
    }
    if (request.provider !== DEEPSEEK_PROVIDER) {
      throw new Error('Oh My DSH DeepSeek discovery needs a one-shot key or the official provider route')
    }
    return (await ctx.llm.listModels(DEEPSEEK_PROVIDER)).map(model => ({
      id: model.id,
      name: model.name,
    }))
  })
}

/**
 * Reuse the pinned upstream connection and widen its configuration-plane
 * authority to the trusted LAN origins explicitly selected by this product.
 * @param ctx - Cordis context carrying the upstream Web and API services.
 * @param config - product connection and discovery settings.
 */
export function apply(ctx: ProductContext, config: Config): void {
  applyProductEnhancements(ctx, config)
  const connectionConfig: ConnectionConfig = {
    trustedHosts: config.trustedHosts,
    ...(config.maxRequestBodyBytes === undefined
      ? {}
      : { maxRequestBodyBytes: config.maxRequestBodyBytes }),
  }
  applyUpstreamConnection(ctx as unknown as Context, connectionConfig)
  applyProductFullAccessRoutes(ctx, config)
}
