import type { ReactNode } from 'react'
import { act, renderHook, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { DecodeFailure } from '../core'
import { NotificationProvider, ToastRegion } from '../editor/design-system'
import { openDocumentHandle } from '../session'
import type {
  FlowResult,
  FolderRefusal,
  ImportFailure,
  RestoreRefusal,
  SessionPorts,
  SwitchResult,
} from '../session'
import {
  ARCHIVE_LIMITS,
  DocumentDecodeError,
  InMemoryFolderAccess,
  InMemoryProjectIndex,
  InMemoryProjectLockPort,
  InMemoryProjectStore,
} from '../storage'
import type { ArchiveLimitName, TwoDocumentFiles } from '../storage'
import { createInitialProject } from './create-initial-project'
import { useSwitchNotices } from './use-switch-notices'
import type { FlowNoticeOptions } from './use-switch-notices'

const FLUSH_FAILED_SENTENCE = 'The changes could not be saved, so the project stays open.'
const OPEN_ELSEWHERE_SENTENCE = 'This project is open in another tab.'
const NOT_STORED_SENTENCE = 'This project is not stored in this browser.'
const FOLDER_EMPTY_SENTENCE = 'This folder holds no Vernacular project.'
const FOLDER_PERMISSION_SENTENCE = 'Vernacular has no permission to use this folder.'
const FOLDER_UNAVAILABLE_SENTENCE = 'The folder of this project cannot be reached.'
const TWO_FILES_SENTENCE =
  'This project has two plan files. Open it from the Projects page to choose one.'
const TWO_FILES: TwoDocumentFiles = {
  state: 'both-readable',
  main: { name: 'vernacular.json', changedAt: undefined, digest: 'abc' },
  second: { name: 'vernacular.format-1.json', changedAt: undefined, digest: 'def' },
}
const RECOVERY_COPY_UNREADABLE_SENTENCE =
  "A recovery copy could not be read. It is kept with the project's backups."
const STORAGE_MESSAGE = 'The storage of this browser is full.'
/** Each archive limit and the sentence of an archive above it, at the default value of the limit. */
const ARCHIVE_TOO_LARGE_SENTENCES: readonly (readonly [ArchiveLimitName, string])[] = [
  ['archiveBytes', 'The file is larger than 512 MB.'],
  ['inflatedBytes', 'The file unpacks to more than 1,024 MB.'],
  ['entries', 'The file holds more than 10,000 entries.'],
  ['documentBytes', 'The project document in the file is larger than 64 MB.'],
]

/** What a flow gives to the notices, or `undefined` when the owner was busy. */
type ShownResult = FlowResult<ImportFailure | FolderRefusal | RestoreRefusal> | undefined
type ShownFailure = Extract<NonNullable<ShownResult>, { readonly ok: false }>['failure']

function inMemoryPorts(): SessionPorts {
  return {
    workspace: new InMemoryProjectStore(),
    locks: new InMemoryProjectLockPort(),
    folders: new InMemoryFolderAccess(),
    now: () => new Date(),
    index: new InMemoryProjectIndex(),
    build: 'test-build',
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

function failed(failure: ShownFailure): ShownResult {
  return { ok: false, failure }
}

function WithToasts({ children }: { children: ReactNode }) {
  return (
    <NotificationProvider>
      {children}
      <ToastRegion />
    </NotificationProvider>
  )
}

/** Gives each result in turn to the function of the hook, with the options. */
async function showResults(
  results: readonly ShownResult[],
  options?: FlowNoticeOptions,
): Promise<void> {
  const { result } = renderHook(() => useSwitchNotices(), { wrapper: WithToasts })
  await act(async () => {
    for (const shown of results) result.current(shown, options)
  })
}

async function showResult(result: ShownResult): Promise<void> {
  await showResults([result])
}

function expectNothingShown(): void {
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
}

/** Expects exactly one error notification, whose text is `text` and nothing else. */
function expectOneError(text: string): void {
  const alert = screen.getByRole('alert')
  expect(within(alert).getByText(text)).toBeInTheDocument()
  expect(screen.getAllByRole('alert')).toHaveLength(1)
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

  it('a busy owner, a cancelled pick, and nothing to restore show nothing', async () => {
    await showResults([
      undefined,
      failed({ kind: 'cancelled' }),
      failed({ kind: 'nothing-to-restore' }),
    ])

    expectNothingShown()
  })
})

describe('useSwitchNotices for a project that cannot be reached', () => {
  it('open-elsewhere shows "This project is open in another tab."', async () => {
    await showResult(failed({ kind: 'open-elsewhere' }))

    expectOneError(OPEN_ELSEWHERE_SENTENCE)
  })

  it('not-found shows "This project is not stored in this browser."', async () => {
    await showResult(failed({ kind: 'not-found' }))

    expectOneError(NOT_STORED_SENTENCE)
  })

  it('two-files shows that the project has two plan files and where to choose one', async () => {
    await showResult(failed({ kind: 'two-files', files: TWO_FILES }))

    expectOneError(TWO_FILES_SENTENCE)
  })

  it('folder-empty shows "This folder holds no Vernacular project."', async () => {
    await showResult(failed({ kind: 'folder-empty' }))

    expectOneError(FOLDER_EMPTY_SENTENCE)
  })

  it('folder-permission and folder-unavailable show their sentences', async () => {
    await showResults([
      failed({ kind: 'folder-permission' }),
      failed({ kind: 'folder-unavailable' }),
    ])

    const alerts = screen.getAllByRole('alert')
    expect(alerts).toHaveLength(2)
    expect(screen.getByText(FOLDER_PERMISSION_SENTENCE)).toBeInTheDocument()
    expect(screen.getByText(FOLDER_UNAVAILABLE_SENTENCE)).toBeInTheDocument()
  })
})

describe('useSwitchNotices for a failure with a reason', () => {
  it('a document that does not decode shows "Open failed: " and the sentence of the decode failure', async () => {
    const notJson: DecodeFailure = { kind: 'not-json', message: 'Unexpected token' }
    const newer: DecodeFailure = { kind: 'newer-version', version: 99, buildVersion: 1 }

    await showResults([
      failed({ kind: 'did-not-open', decode: notJson }),
      failed({ kind: 'did-not-import', decode: newer }),
    ])

    expect(screen.getAllByRole('alert')).toHaveLength(2)
    for (const decode of [notJson, newer]) {
      const sentence = new DocumentDecodeError(decode).message
      expect(screen.getByText(`Open failed: ${sentence}`)).toBeInTheDocument()
    }
  })

  it('a recovery copy that does not decode says that it could not be read and is kept', async () => {
    await showResult(failed({ kind: 'did-not-restore', decode: { kind: 'not-a-project' } }))

    expectOneError(RECOVERY_COPY_UNREADABLE_SENTENCE)
    expect(screen.queryByText(/^Open failed/)).not.toBeInTheDocument()
  })

  it('an unsupported file shows "Open failed: Unsupported project file: " and the name', async () => {
    await showResult(failed({ kind: 'unsupported-file', fileName: 'plan.pdf' }))

    expectOneError('Open failed: Unsupported project file: plan.pdf')
  })

  it.each(ARCHIVE_TOO_LARGE_SENTENCES)(
    'an archive above %s shows "Open failed: " and the sentence of that limit',
    async (limit, sentence) => {
      await showResult(failed({ kind: 'archive-too-large', limit, allowed: ARCHIVE_LIMITS[limit] }))

      expectOneError(`Open failed: ${sentence}`)
    },
  )

  it('storage-unavailable shows "Open failed: " and the message', async () => {
    await showResult(failed({ kind: 'storage-unavailable', message: STORAGE_MESSAGE }))

    expectOneError(`Open failed: ${STORAGE_MESSAGE}`)
  })

  it('the action option changes the prefix, and the retry option adds a Retry action that calls it', async () => {
    const onRetry = vi.fn()
    const failure = failed({ kind: 'storage-unavailable', message: STORAGE_MESSAGE })

    await showResults([failure], { action: 'Import', onRetry })

    expectOneError(`Import failed: ${STORAGE_MESSAGE}`)
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('a sentence failure ignores the action option', async () => {
    await showResults([failed({ kind: 'open-elsewhere' })], { action: 'Import' })

    expectOneError(OPEN_ELSEWHERE_SENTENCE)
    expect(screen.queryByText(/Import failed/)).not.toBeInTheDocument()
  })
})
