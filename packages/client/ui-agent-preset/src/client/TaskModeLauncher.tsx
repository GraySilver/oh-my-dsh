import { useState } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AgentPresetSettingsKey } from './locales.ts'
import css from './TaskModeLauncher.module.css'

/** Product task modes mapped to existing Harness command and prompt channels. */
export type TaskMode = 'quick' | 'plan' | 'autonomous'

interface ModeCopy {
  id: TaskMode
  title: AgentPresetSettingsKey
  description: AgentPresetSettingsKey
}

const MODES: readonly ModeCopy[] = [
  { id: 'quick', title: 'modeQuick', description: 'modeQuickDescription' },
  { id: 'plan', title: 'modePlan', description: 'modePlanDescription' },
  { id: 'autonomous', title: 'modeAutonomous', description: 'modeAutonomousDescription' },
]

/** Props injected from the task-mode plugin's scoped client services. */
export interface TaskModeLauncherProps {
  startTask: (mode: TaskMode, task: string) => Promise<void>
  launchCwd?: string
  useLaunchWorkspace: () => Promise<void>
  t: (key: AgentPresetSettingsKey) => string
}

/** Render the primary Oh My DSH launch affordance and its task-mode dialog. */
export function TaskModeLauncher({ startTask, launchCwd, useLaunchWorkspace, t }: TaskModeLauncherProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<TaskMode>('quick')
  const [task, setTask] = useState('')
  const [busy, setBusy] = useState(false)
  const [workspaceBusy, setWorkspaceBusy] = useState(false)
  const [workspaceAvailable, setWorkspaceAvailable] = useState(launchCwd !== undefined)
  const [error, setError] = useState<string | null>(null)

  const adoptWorkspace = async (): Promise<void> => {
    setWorkspaceBusy(true)
    setError(null)
    try {
      await useLaunchWorkspace()
      setWorkspaceAvailable(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setWorkspaceBusy(false)
    }
  }

  const submit = async (): Promise<void> => {
    const value = task.trim()
    if (value === '') {
      setError(t('taskRequired'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await startTask(mode, value)
      setOpen(false)
      setTask('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className={css.launchRow}>
        <button type="button" className={css.launch} onClick={() => { setOpen(true); setError(null) }}>
          <span className={css.product}>{t('productName')}</span>
          <span className={css.launchLabel}>{t('startTask')}</span>
        </button>
        {launchCwd !== undefined && workspaceAvailable && (
          <button
            type="button"
            className={css.cwd}
            title={launchCwd}
            disabled={workspaceBusy}
            onClick={() => { void adoptWorkspace() }}
          >
            {workspaceBusy ? t('usingDirectory') : t('useCurrentDirectory')}
          </button>
        )}
      </div>
      <Modal
        open={open}
        onClose={() => { if (!busy) setOpen(false) }}
        title={t('taskDialogTitle')}
        closeLabel={t('close')}
        description={t('taskDialogDescription')}
        {...css.dialog === undefined ? {} : { className: css.dialog }}
        footer={(
          <>
            <Button variant="ghost" disabled={busy} onClick={() => { setOpen(false) }}>{t('cancel')}</Button>
            <Button variant="primary" disabled={busy} onClick={() => { void submit() }}>
              {busy ? t('startingTask') : t('start')}
            </Button>
          </>
        )}
      >
        {launchCwd !== undefined && workspaceAvailable && (
          <button
            type="button"
            className={css.directoryCard}
            title={launchCwd}
            disabled={workspaceBusy}
            onClick={() => { void adoptWorkspace() }}
          >
            <span>{workspaceBusy ? t('usingDirectory') : t('useCurrentDirectory')}</span>
            <code>{launchCwd}</code>
          </button>
        )}
        <div className={css.modes} role="radiogroup" aria-label={t('taskMode')}>
          {MODES.map(item => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={mode === item.id}
              className={css.mode}
              onClick={() => { setMode(item.id) }}
            >
              <span className={css.modeTitle}>{t(item.title)}</span>
              <span className={css.modeDescription}>{t(item.description)}</span>
            </button>
          ))}
        </div>
        <label className={css.taskLabel}>
          <span>{t('taskLabel')}</span>
          <textarea
            autoFocus
            rows={5}
            value={task}
            placeholder={t('taskPlaceholder')}
            disabled={busy}
            onChange={(event) => { setTask(event.currentTarget.value) }}
          />
        </label>
        {error !== null && <p className={css.error} role="alert">{error}</p>}
      </Modal>
    </>
  )
}
