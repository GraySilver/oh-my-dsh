import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  healProfilesModuleFallback: vi.fn(),
  spawn: vi.fn(),
}))

vi.mock('@deepseek-ai/dsh-app-boot', () => ({
  healProfilesModuleFallback: mocks.healProfilesModuleFallback,
}))

vi.mock('node:child_process', () => ({ spawn: mocks.spawn }))

import { startWebRuntime } from '../src/launch.ts'

class FakeChild extends EventEmitter {
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  exitCode: number | null = null
  signalCode: NodeJS.Signals | null = null

  kill(signal: NodeJS.Signals): boolean {
    this.signalCode = signal
    return true
  }
}

describe('oh-my-dsh web startup failures', () => {
  beforeEach(() => {
    mocks.healProfilesModuleFallback.mockReset()
    mocks.spawn.mockReset()
  })

  it('includes recent runtime output when the child exits before ready', async () => {
    const child = new FakeChild()
    mocks.spawn.mockReturnValue(child)

    const startup = startWebRuntime({ onOutput: () => {} })
    child.stderr.write("Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@deepseek-ai/dsh-llm'\n")
    child.exitCode = 1
    child.emit('close', 1, null)

    await expect(startup).rejects.toThrow(
      /web runtime exited before ready[\s\S]*Recent runtime output:[\s\S]*Cannot find package '@deepseek-ai\/dsh-llm'/,
    )
  })
})
