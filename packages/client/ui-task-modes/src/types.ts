import type { SessionEventMap } from '@deepseek-ai/dsh-session'

/** Task strategy persisted in a session. */
export type TaskMode = 'normal' | 'first-principles'

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * System-prompt strategy selected for later requests. The last value wins;
     * no event means normal mode.
     */
    'task-mode/selected': { mode: TaskMode }
  }
}

/**
 * Resolve the task mode recorded most recently in a session log.
 * @param events - Ordered durable session events.
 * @returns The selected mode, or normal mode when no valid selection exists.
 */
export function taskModeOf(events: readonly { type: string; data: unknown }[]): TaskMode {
  let mode: TaskMode = 'normal'
  for (const event of events) {
    if (event.type !== 'task-mode/selected' || typeof event.data !== 'object' || event.data === null) continue
    const value = (event.data as { mode?: unknown }).mode
    if (value === 'normal' || value === 'first-principles') mode = value
  }
  return mode
}

export type { SessionEventMap }
