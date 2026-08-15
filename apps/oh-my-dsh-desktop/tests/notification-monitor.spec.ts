import { describe, expect, it } from 'vitest'
import { notificationOf } from '../src/notification-monitor.ts'

describe('Desktop native notifications', () => {
  it('reports completed turns with a stable session and sequence key', () => {
    expect(notificationOf({
      payload: {
        type: 'session/event',
        sessionId: 'session-1',
        event: { type: 'turn/end', seq: 12, data: { turn: 3, reason: { kind: 'completed' } } },
      },
    })).toEqual({
      key: 'session/event:session-1:12',
      title: 'Oh My DSH 任务完成',
      body: '第 3 轮任务已完成。',
      sessionId: 'session-1',
    })
  })

  it('uses the structured turn failure message', () => {
    expect(notificationOf({
      payload: {
        type: 'session/event',
        sessionId: 'session-2',
        event: {
          type: 'turn/end',
          seq: 8,
          data: { turn: 2, reason: { kind: 'error', error: { message: 'provider unavailable' } } },
        },
      },
    })).toMatchObject({
      title: 'Oh My DSH 任务失败',
      body: 'provider unavailable',
    })
  })

  it('maps approval and question requests from their RPC envelopes', () => {
    expect(notificationOf({
      rpcId: 'approval-rpc',
      payload: { type: 'approval/requested', sessionId: 'session-3', approvalId: 'approval-1', toolName: 'bash' },
    })).toMatchObject({ key: 'approval/requested:approval-1', title: 'Oh My DSH 需要确认' })
    expect(notificationOf({
      rpcId: 'question-rpc',
      payload: {
        type: 'question/requested',
        sessionId: 'session-3',
        questions: [{ id: 'name', question: '选择工作区？' }],
      },
    })).toMatchObject({ key: 'question/requested:question-rpc', body: '选择工作区？' })
  })

  it('ignores unrelated frames', () => {
    expect(notificationOf({ payload: { type: 'session/event', event: { type: 'step/start' } } })).toBeUndefined()
  })
})
