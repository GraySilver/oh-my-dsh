import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { TaskModeControl } from './TaskModeControl.tsx'
import { en, zh, type TaskModeKey } from './locales.ts'

export const inject = ['slots', 'locale', 'connection', 'remote']

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    taskModes: TaskModeKey
  }
}

/** Mount the task-mode selector in the composer tool row. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('taskModes', { en, zh }), 'task-modes: locale')
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left', id: 'task-modes', locale: 'taskModes',
    inject: (sessionId): { getMode: () => 'normal'; run: (line: string) => Promise<string> } => ({
      getMode: () => 'normal',
      run: async (line: string): Promise<string> => {
        const response = await ctx.remote.commands.execute(sessionId, line)
        if (!response.ok) throw new Error(response.error.message)
        return response.value?.result.text ?? ''
      },
    }),
  }, TaskModeControl))
}

export type { TaskModeControlProps } from './TaskModeControl.tsx'
