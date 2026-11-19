import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { NotificationProvider, ToastRegion } from '../editor/design-system'
import { openDocumentHandle } from '../session'
import type { SessionPorts, SwitchResult } from '../session'
import { InMemoryFolderAccess, InMemoryProjectLockPort, InMemoryProjectStore } from '../storage'
import { createInitialProject } from './create-initial-project'
import { useSwitchNotices } from './use-switch-notices'

const FLUSH_FAILED_SENTENCE = 'The changes could not be saved, so the project stays open.'

function inMemoryPorts(): SessionPorts {
  return {
    workspace: new InMemoryProjectStore(),
    locks: new InMemoryProjectLockPort(),
    folders: new InMemoryFolderAccess(),
    now: () => new Date(),
  }
}

/** The result of a switch that opened a project. */
async function successfulResult(): Promise<SwitchResult> {
  const result = await openDocumentHandle(inMemoryPorts(), {
    id: 'a',
    location: { kind: 'workspace' },
    create: createInitialProject,
  })
  if (!result.ok) throw new Error(`Expected the open to succeed: ${JSON.stringify(result.failure)}`)
  return result
}

function Harness({ result }: { result: SwitchResult }) {
  const showResult = useSwitchNotices()
  return (
    <>
      <button type="button" onClick={() => showResult(result)}>
        Show the result
      </button>
      <ToastRegion />
    </>
  )
}

async function showResult(result: SwitchResult): Promise<void> {
  render(
    <NotificationProvider>
      <Harness result={result} />
    </NotificationProvider>,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Show the result' }))
}

describe('useSwitchNotices', () => {
  it('shows that the changes could not be saved when a switch ends with a failed flush', async () => {
    await showResult({ ok: false, failure: { kind: 'flush-failed' } })

    const alert = screen.getByRole('alert')
    expect(within(alert).getByText(FLUSH_FAILED_SENTENCE)).toBeInTheDocument()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('shows nothing when a switch opened the target', async () => {
    await showResult(await successfulResult())

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows nothing when the target did not open', async () => {
    await showResult({ ok: false, failure: { kind: 'not-found' } })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
