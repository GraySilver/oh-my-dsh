import type { LlmDiscoveredModel, LlmModelDiscoveryRequest } from '@deepseek-ai/dsh-llm'

const MAX_RESPONSE_BYTES = 1_000_000
const DEEPSEEK_PUBLIC_BASE_URL = 'https://api.deepseek.com'

interface DeepSeekModelsResponse {
  data?: unknown
}

/** Resolve the OpenAI-compatible model-list endpoint without discarding a base path. */
function modelsEndpoint(baseURL: string): URL {
  const endpoint = new URL(baseURL)
  if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') {
    throw new Error('Oh My DSH connection test requires an HTTP or HTTPS DeepSeek endpoint')
  }
  endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, '')}/models`
  endpoint.search = ''
  endpoint.hash = ''
  return endpoint
}

/** Read one JSON response while bounding the complete body retained in memory. */
async function readBoundedJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new Error('DeepSeek connection test returned an oversized model list')
  }
  if (response.body === null) throw new Error('DeepSeek connection test returned an empty response')

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > MAX_RESPONSE_BYTES) {
      await reader.cancel()
      throw new Error('DeepSeek connection test returned an oversized model list')
    }
    chunks.push(value)
  }

  const body = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder().decode(body)) as unknown
  } catch {
    throw new Error('DeepSeek connection test returned invalid JSON')
  }
}

/**
 * Test one unsaved DeepSeek endpoint and credential through its model-list API.
 * @param request - draft endpoint and one-shot key from the browser.
 * @param timeoutMs - product-configured upper bound for the HTTP request.
 * @returns Models advertised by the authenticated endpoint.
 */
export async function discoverDeepSeekModels(
  request: LlmModelDiscoveryRequest,
  timeoutMs: number,
): Promise<LlmDiscoveredModel[]> {
  const baseURL = request.baseURL === undefined || request.baseURL.length === 0
    ? DEEPSEEK_PUBLIC_BASE_URL
    : request.baseURL
  const apiKey = request.apiKey
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error('Oh My DSH connection test needs the unsaved DeepSeek API key')
  }
  const timeout = AbortSignal.timeout(timeoutMs)
  const signal = request.signal === undefined
    ? timeout
    : AbortSignal.any([request.signal, timeout])
  const response = await fetch(modelsEndpoint(baseURL), {
    method: 'GET',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    signal,
  })
  if (!response.ok) {
    throw new Error(`DeepSeek connection test failed with HTTP ${String(response.status)}`)
  }

  const document = await readBoundedJson(response) as DeepSeekModelsResponse
  if (!Array.isArray(document.data)) {
    throw new Error('DeepSeek connection test response has no model list')
  }
  const models: LlmDiscoveredModel[] = []
  for (const candidate of document.data) {
    if (candidate === null || typeof candidate !== 'object') continue
    const id = (candidate as { id?: unknown }).id
    if (typeof id !== 'string' || id.length === 0) continue
    models.push({ id, name: id })
  }
  if (models.length === 0) throw new Error('DeepSeek connection test returned no usable models')
  return models
}
