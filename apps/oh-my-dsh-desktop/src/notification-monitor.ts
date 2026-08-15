/** A native notification request derived from one authoritative gateway frame. */
export interface DesktopNotificationEvent {
  key: string
  title: string
  body: string
  sessionId?: string
}

type JsonRecord = Record<string, unknown>

function isCancelled(state: { value: boolean }): boolean {
  return state.value
}

function recordOf(value: unknown): JsonRecord | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value as JsonRecord
}

function stringField(record: JsonRecord | undefined, key: string): string | undefined {
  const value = record?.[key]
  return typeof value === 'string' ? value : undefined
}

/** Convert one mux or host envelope into a native notification request. */
export function notificationOf(envelope: unknown): DesktopNotificationEvent | undefined {
  const full = recordOf(envelope)
  const frame = recordOf(full?.payload)
  const type = stringField(frame, 'type')
  if (type === undefined) return undefined
  const sessionId = stringField(frame, 'sessionId')
  if (type === 'approval/requested') {
    const approvalId = stringField(frame, 'approvalId') ?? 'unknown'
    const toolName = stringField(frame, 'toolName') ?? '工具操作'
    return {
      key: `${type}:${approvalId}`,
      title: 'OhMyDSH 需要确认',
      body: `是否允许 ${toolName} 继续执行？`,
      ...(sessionId === undefined ? {} : { sessionId }),
    }
  }
  if (type === 'question/requested') {
    const questions = Array.isArray(frame?.questions) ? frame.questions : []
    const first = recordOf(questions[0])
    const question = stringField(first, 'question') ?? '有一个问题等待回答。'
    const rpcId = stringField(full, 'rpcId') ?? sessionId ?? 'unknown'
    return {
      key: `${type}:${rpcId}`,
      title: 'OhMyDSH 等待你的回答',
      body: question,
      ...(sessionId === undefined ? {} : { sessionId }),
    }
  }
  if (type === 'host/agent-error') {
    const message = stringField(frame, 'message') ?? 'Agent 运行失败。'
    return {
      key: `${type}:${sessionId ?? 'unknown'}:${message}`,
      title: 'OhMyDSH 运行失败',
      body: message,
      ...(sessionId === undefined ? {} : { sessionId }),
    }
  }
  if (type !== 'session/event') return undefined
  const event = recordOf(frame?.event)
  if (stringField(event, 'type') !== 'turn/end') return undefined
  const data = recordOf(event?.data)
  const reason = recordOf(data?.reason)
  const kind = stringField(reason, 'kind')
  const turn = typeof data?.turn === 'number' ? String(data.turn) : ''
  const sequence = typeof event?.seq === 'number' ? String(event.seq) : turn
  if (kind === 'completed') {
    return {
      key: `${type}:${sessionId ?? 'unknown'}:${sequence}`,
      title: 'OhMyDSH 任务完成',
      body: turn === '' ? '任务已完成。' : `第 ${turn} 轮任务已完成。`,
      ...(sessionId === undefined ? {} : { sessionId }),
    }
  }
  if (kind === 'error') {
    const message = stringField(recordOf(reason?.error), 'message') ?? '任务执行失败。'
    return {
      key: `${type}:${sessionId ?? 'unknown'}:${sequence}:error`,
      title: 'OhMyDSH 任务失败',
      body: message,
      ...(sessionId === undefined ? {} : { sessionId }),
    }
  }
  return undefined
}

async function readSse(url: URL, signal: AbortSignal, onFrame: (frame: unknown) => void): Promise<void> {
  const response = await fetch(url, { signal })
  if (!response.ok || response.body === null) throw new Error(`notification stream failed: HTTP ${String(response.status)}`)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) return
      buffer += decoder.decode(value, { stream: true }).replaceAll('\r\n', '\n')
      let boundary: number
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const chunk = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const data = chunk.split('\n')
          .filter(line => line.startsWith('data: '))
          .map(line => line.slice(6))
          .join('')
        if (data === '') continue
        try {
          onFrame(JSON.parse(data) as unknown)
        } catch (error) {
          console.warn('oh-my-dsh desktop: ignored malformed notification frame', error)
        }
      }
    }
  } finally {
    await reader.cancel()
  }
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    }, { once: true })
  })
}

/** Reconnecting, deduplicating reader for the gateway's existing event streams. */
export class NotificationMonitor {
  private readonly cancellations = new Set<() => void>()
  private readonly seen = new Set<string>()
  private workers: Promise<void>[] = []
  private stopped = true

  constructor(
    private readonly baseUrl: string,
    private readonly onNotification: (event: DesktopNotificationEvent) => void,
  ) {}

  /** Start mux and host streams; repeated calls are idempotent. */
  start(): void {
    if (!this.stopped) return
    this.stopped = false
    this.workers = ['/api/events.mux', '/api/events.host'].map(path => this.run(path))
  }

  /** Abort streams and wait until their readers have stopped. */
  async stop(): Promise<void> {
    this.stopped = true
    for (const cancel of this.cancellations) cancel()
    await Promise.all(this.workers)
    this.workers = []
    this.cancellations.clear()
  }

  private async run(path: string): Promise<void> {
    const controller = new AbortController()
    const state = { value: false }
    const cancel = (): void => {
      state.value = true
      controller.abort()
    }
    this.cancellations.add(cancel)
    const url = new URL(path, this.baseUrl)
    try {
      while (!isCancelled(state)) {
        try {
          await readSse(url, controller.signal, (frame) => {
            const event = notificationOf(frame)
            if (event === undefined || this.seen.has(event.key)) return
            this.seen.add(event.key)
            if (this.seen.size > 512) this.seen.delete(this.seen.values().next().value as string)
            try {
              this.onNotification(event)
            } catch (error) {
              console.error('oh-my-dsh desktop: notification listener failed', error)
            }
          })
        } catch (error) {
          if (isCancelled(state)) break
          console.warn(`oh-my-dsh desktop: ${path} disconnected`, error)
        }
        if (isCancelled(state)) break
        await wait(1500, controller.signal)
      }
    } finally {
      this.cancellations.delete(cancel)
    }
  }
}
