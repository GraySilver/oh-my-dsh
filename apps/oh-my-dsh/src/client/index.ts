/**
 * Oh My DSH browser connection wrapper. The transport implementation remains
 * the upstream connection client; this product changes only the capability
 * fact consumed by UI plugins so an explicitly trusted LAN origin receives
 * the same controls as localhost.
 */
import type { Context } from '@deepseek-ai/cordis'
import {
  apply as applyUpstreamConnection,
  type ConnectionHandle,
} from '@graysilver/oh-my-dsh-upstream-connection-client'

/** This product-owned connection remains the browser wire root. */
export const inject: string[] = []

/** Provide the upstream handle with Oh My DSH's equal-origin capability policy. */
export function apply(ctx: Context): void {
  let upstream: ConnectionHandle | undefined
  const capture = {
    provide(name: string, value: unknown): void {
      if (name !== 'connection' || upstream !== undefined) {
        throw new Error(`oh-my-dsh: unexpected upstream client provision ${JSON.stringify(name)}`)
      }
      upstream = value as ConnectionHandle
    },
  } as unknown as Context
  applyUpstreamConnection(capture)
  if (upstream === undefined) {
    throw new Error('oh-my-dsh: upstream connection client did not provide a handle')
  }
  const connection: ConnectionHandle = { ...upstream, isLoopback: true }
  ctx.provide('connection', connection)
}
