import { describe, expect, it } from 'vitest'
import { taskModeOf } from '../src/types.ts'

describe('taskModeOf', () => {
  it('defaults to normal and folds the last recorded selection', () => {
    expect(taskModeOf([])).toBe('normal')
    expect(taskModeOf([
      { type: 'task-mode/selected', data: { mode: 'first-principles' } },
      { type: 'user/message', data: {} },
      { type: 'task-mode/selected', data: { mode: 'normal' } },
    ])).toBe('normal')
  })

  it('does not treat malformed durable data as an active mode', () => {
    expect(taskModeOf([{ type: 'task-mode/selected', data: { mode: 'review' } }])).toBe('normal')
  })
})
