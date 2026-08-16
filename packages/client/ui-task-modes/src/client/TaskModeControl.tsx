import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TaskModeKey } from './locales.ts'

type Mode = 'normal' | 'first-principles'
interface Injected { getMode: () => Mode; run: (line: string) => Promise<string> }
export type TaskModeControlProps = PropsRuntime<'conversation.input.left'> & PropsLocale<'taskModes'> & InjectFace<Injected>

const normalMode = { id: 'normal', title: 'normal', description: 'normalDescription' } as const
const modes: readonly { id: Mode; title: TaskModeKey; description: TaskModeKey }[] = [
  normalMode,
  { id: 'first-principles', title: 'firstPrinciples', description: 'firstPrinciplesDescription' },
]

/** Compact input-row selector for the session system-prompt strategy. */
export function TaskModeControl({ getMode, run, t }: TaskModeControlProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>(getMode())
  const [busy, setBusy] = useState(false)
  const selected = modes.find(item => item.id === mode) ?? normalMode
  const choose = async (next: Mode): Promise<void> => {
    setBusy(true)
    try {
      await run(`/task-mode ${next}`)
      setMode(next)
      setOpen(false)
    } finally { setBusy(false) }
  }
  useEffect(() => {
    void run('/task-mode').then((text) => {
      const value = text.slice('task mode: '.length)
      if (value === 'normal' || value === 'first-principles') setMode(value)
    })
  }, [run])
  return <Menu
    open={open}
    onClose={() => { setOpen(false) }}
    items={[
      ...modes.map(item => ({ id: item.id, label: <span><strong>{t(item.title)}</strong><small>{t(item.description)}</small></span> })),
      { id: 'review', label: <span><strong>{t('review')}</strong><small>{t('reviewDescription')}</small></span> },
    ]}
    selectedId={mode}
    onSelect={(id) => { if (id === 'review') void run('/adversarial-review'); else void choose(id as Mode) }}
    anchor={<button type="button" disabled={busy} aria-haspopup="menu" aria-expanded={open} onClick={() => { setOpen(value => !value) }}>{t(selected.title)}</button>}
  />
}
