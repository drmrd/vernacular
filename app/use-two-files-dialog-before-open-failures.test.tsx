import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MAIN_NAME } from '../session/flows/choose-kept-file-test-kit'
import { PROJECT_ID } from '../session/flows/open-failed-test-kit'
import type { TestPorts } from '../session/handle/handle-test-kit'
import {
  clickCardOf,
  expectOpenProject,
  findCardLink,
  findThePageAlert,
  findTheProjectsPage,
  secondTab,
  settleForAWhile,
} from './app-test-support'
import { setUpProjectsScreenTests } from './projects-screen-test-support'
import {
  KEEP_BOTH_CONTROL,
  OPEN_AS_NEW,
  REMOVE_CONTROL,
  REPLACE_CONTROL,
  TWO_FILES_TITLE,
  chooseInTheDialog,
  expectNoDialog,
  findTheTwoFilesDialog,
  holdTheChoice,
  portsWithTwoFiles,
  showThePageOf,
} from './two-files-dialog-test-support'
import type { ChoiceMethod } from './two-files-dialog-test-support'

setUpProjectsScreenTests()

const CHANGE_FAILED = 'Could not change the plan files'
const DISK_GONE = 'The disk did not answer'

/** Makes the next open of the project `a` fail in one way that a click on its card can show. */
interface OpenFailure {
  readonly kind: string
  happens(ports: TestPorts): Promise<void>
}

const OPEN_FAILURES: readonly OpenFailure[] = [
  {
    kind: 'open-elsewhere',
    happens: async (ports) => {
      const hold = await secondTab(ports).locks.tryAcquire(PROJECT_ID)
      if (hold === undefined) throw new Error('The lock of the project was held already')
    },
  },
  {
    kind: 'storage-unavailable',
    happens: (ports) => {
      vi.spyOn(ports.locks, 'tryAcquire').mockRejectedValue(new Error(DISK_GONE))
      return Promise.resolve()
    },
  },
]

/** What the Projects page shows about the project `a`: its notice, if any, its card, and the text of the dialog that shows, if any. */
interface PageOutcome {
  readonly notice: string | undefined
  readonly card: string
  readonly dialog: string | undefined
}

async function whatThePageShows(): Promise<PageOutcome> {
  await settleForAWhile()
  const page = await findTheProjectsPage()
  return {
    notice: within(page).queryByRole('alert')?.textContent ?? undefined,
    card: (await findCardLink(MAIN_NAME)).textContent ?? '',
    dialog: screen.queryByRole('alertdialog')?.textContent ?? undefined,
  }
}

/** What the page shows before and after a click on the card of the project `a`, when `failure` happens to the open. */
async function whatACardClickShows(
  failure: OpenFailure,
): Promise<{ before: PageOutcome; after: PageOutcome }> {
  const { ports } = await portsWithTwoFiles('both-readable')
  const rendered = await showThePageOf(ports)
  const before = await whatThePageShows()
  await failure.happens(ports)
  await clickCardOf(MAIN_NAME)
  const after = await whatThePageShows()
  rendered.unmount()
  return { before, after }
}

/** The page over durable ports whose project `a` has two readable plan files, with the dialog that asks before the open. */
async function askedBeforeTheOpen(): Promise<{ ports: TestPorts; dialog: HTMLElement }> {
  const { ports } = await portsWithTwoFiles('both-readable')
  await showThePageOf(ports)
  await clickCardOf(MAIN_NAME)
  return { ports, dialog: await findTheTwoFilesDialog() }
}

const CHOICES = [
  { name: OPEN_AS_NEW, method: 'readSecondFile' },
  { name: REPLACE_CONTROL, method: 'promoteSecondFile' },
  { name: REMOVE_CONTROL, method: 'setAsideSecondFile' },
] as const satisfies readonly { readonly name: string; readonly method: ChoiceMethod }[]

describe('A choice before a project with two readable plan files opens, when it fails', () => {
  it.each(OPEN_FAILURES)(
    'a refused "Open and keep both plan files", with $kind, shows what a click on the card shows for that failure',
    async (failure) => {
      const { before, after: onCardClick } = await whatACardClickShows(failure)
      expect(onCardClick).not.toEqual(before)
      expect(onCardClick.notice ?? '').not.toContain(CHANGE_FAILED)
      const { ports, dialog } = await askedBeforeTheOpen()
      await failure.happens(ports)

      await chooseInTheDialog(dialog, KEEP_BOTH_CONTROL)

      await waitFor(() =>
        expect(screen.queryByRole('alertdialog', { name: TWO_FILES_TITLE })).toBeNull(),
      )
      expect(await whatThePageShows()).toEqual(onCardClick)
      expect(screen.queryByText(new RegExp(CHANGE_FAILED))).not.toBeInTheDocument()
    },
  )

  it.each(CHOICES)(
    'a refused "$name" still reads that the plan files could not be changed, with the reason',
    async ({ name, method }) => {
      const { ports, dialog } = await askedBeforeTheOpen()
      vi.spyOn(ports.workspace, method).mockRejectedValueOnce(new Error(DISK_GONE))

      await chooseInTheDialog(dialog, name)

      await expectNoDialog()
      expect(await findThePageAlert()).toHaveTextContent(`${CHANGE_FAILED}: ${DISK_GONE}`)
    },
  )
})

describe('A choice that runs before a project with two readable plan files opens', () => {
  it('keeps the dialog shown, with every control disabled, until the choice ends', async () => {
    const { ports, dialog } = await askedBeforeTheOpen()
    const held = holdTheChoice(ports, 'setAsideSecondFile')

    await chooseInTheDialog(dialog, REMOVE_CONTROL)

    await waitFor(() => expect(held.calls).toHaveBeenCalledOnce())
    await settleForAWhile()
    const shown = screen.getByRole('alertdialog', { name: TWO_FILES_TITLE })
    for (const button of within(shown).getAllByRole('button')) expect(button).toBeDisabled()
    held.release()
    await expectOpenProject(MAIN_NAME)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
