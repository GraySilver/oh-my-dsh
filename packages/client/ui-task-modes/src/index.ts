import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-subagent'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { taskModeOf, type TaskMode } from './types.ts'

const FIRST_PRINCIPLES = 'For this task, reason from first principles. State the objective and success criteria, separate verified facts from assumptions, identify hard constraints, derive the solution from those facts, and describe how you will verify the result. Do not treat conventions or guesses as requirements.'

function appendMode(agent: Agent, mode: TaskMode): number {
  return agent.session.append('task-mode/selected', { mode }).seq
}

/** Register task-mode commands and the first-principles system-prompt section. */
export function apply(ctx: Context): void {
  ctx.inject(['commands', 'systemPrompt', 'subagents'], (scope: Context) => {
    scope.effect(() => scope.systemPrompt.section({
      name: 'task-mode:first-principles',
      order: 80,
      text: ({ agent }) => agent === undefined || taskModeOf(agent.session.events) !== 'first-principles'
        ? ''
        : FIRST_PRINCIPLES,
    }), 'task-modes: first-principles prompt')

    scope.effect(() => scope.commands.register({
      name: 'task-mode',
      description: 'Select normal or first-principles task execution.',
      recordInput: false,
      handler: ({ agent, rawInput }) => {
        const mode = rawInput.trim()
        if (mode === '') return { kind: 'success', text: `task mode: ${taskModeOf(agent.session.events)}` }
        if (mode !== 'normal' && mode !== 'first-principles') return { kind: 'error', text: 'task-mode expects normal or first-principles' }
        const seq = appendMode(agent, mode)
        return { kind: 'success', text: `task mode: ${mode}`, sourceEventSeq: seq }
      },
    }), 'task-modes: task-mode command')

    scope.effect(() => scope.commands.register({
      name: 'adversarial-review',
      description: 'Ask a read-only child agent to review the current session against its task.',
      recordInput: false,
      handler: async ({ agent, signal }) => {
        const provider = scope.subagents.getProvider('fork')
        if (provider === undefined) return { kind: 'error', text: 'adversarial review requires the fork subagent provider' }
        const run = await scope.subagents.start('fork', {
          parent: agent,
          signal,
          label: 'adversarial-review',
          prompt: [{ type: 'text', text: 'Review the current session against its task expectation. Identify unmet requirements, unsupported claims, omissions, regressions, counterexamples, and security risks. Do not modify files. Return a structured verdict with evidence and concrete follow-up actions.' }],
          toolFilter: { deny: ['write', 'edit', 'bash', 'pwsh', 'run_in_background'] },
        })
        const result = await run.result
        await run.dispose()
        const text = result.output.map(block => block.type === 'text' ? block.text : '').join('') || 'review completed'
        return { kind: result.stopReason === 'error' ? 'error' : 'success', text }
      },
    }), 'task-modes: adversarial review command')
  })
}

export { taskModeOf, type TaskMode } from './types.ts'
