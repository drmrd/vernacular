import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FailedOpenDialog,
  type FailedOpenCause,
  type FailedOpenDetails,
  type FailedOpenDialogProps,
} from './failed-open-dialog'

afterEach(cleanup)

const TITLE = 'This project did not open.'
const KEPT_UNCHANGED = 'The stored file is kept unchanged.'
const EXPORT_SENTENCE = 'You can export a copy from the Projects page.'
const REPAIR_INTRODUCTION = 'A repair can open this project.'
const FORMAT_VERSION = 17

const DETAILS: FailedOpenDetails = {
  error: 'The document breaks the format rules at 2 places.',
  faults: [
    { path: '/paint/3/patternId', message: 'The field is not defined for a solid color.' },
    { path: '/floors/0/x-old', message: 'The field is not defined.' },
  ],
  formatVersion: FORMAT_VERSION,
  build: '0.3.0',
  removedPaths: [],
}

const CAUSE_SENTENCES: readonly (readonly [string, FailedOpenCause])[] = [
  ['A part of the project breaks the format rules.', 'format-rules'],
  ['A newer version of Vernacular made this project.', 'newer-version'],
  ['The stored file is not a Vernacular project.', 'not-a-project'],
  ['Vernacular could not bring this project up to the current format.', 'migration-failed'],
  ['The storage did not answer.', 'storage-unavailable'],
  ['The folder is not available.', 'folder-unavailable'],
]

const CAUSES_THAT_CAN_RETRY: readonly FailedOpenCause[] = [
  'storage-unavailable',
  'folder-unavailable',
]
const CAUSES_THAT_CANNOT_RETRY: readonly FailedOpenCause[] = [
  'format-rules',
  'newer-version',
  'not-a-project',
  'migration-failed',
]

/** Renders the dialog for a document that breaks the format rules, with the given props changed. */
function renderDialog(changes: Partial<FailedOpenDialogProps> = {}) {
  const props: FailedOpenDialogProps = {
    cause: 'format-rules',
    details: DETAILS,
    onClose: vi.fn(),
    ...changes,
  }
  render(<FailedOpenDialog {...props} />)
  return { user: userEvent.setup(), dialog: screen.getByRole('alertdialog') }
}

/** Gives the details element of the dialog, and fails when the dialog has none. */
function technicalDetails(dialog: HTMLElement): HTMLDetailsElement {
  const details = within(dialog).getByText('Technical details').closest('details')
  if (details === null) throw new Error('The technical text is not inside a details element')
  return details
}

describe('the dialog that says why a project did not open', () => {
  it('shows the title "This project did not open."', () => {
    renderDialog()

    expect(screen.getByRole('heading', { name: TITLE })).toBeInTheDocument()
  })

  it.each(CAUSE_SENTENCES)('says "%s" for the cause %s', (sentence, cause) => {
    const { dialog } = renderDialog({ cause })

    expect(dialog).toHaveTextContent(sentence)
  })

  it('says that the stored file is kept unchanged and that a copy can be exported from the Projects page', () => {
    const { dialog } = renderDialog()

    expect(dialog).toHaveTextContent(KEPT_UNCHANGED)
    expect(dialog).toHaveTextContent(EXPORT_SENTENCE)
  })
})

describe('the technical details of the failed-open dialog', () => {
  it('holds the technical text in a details element that is closed at first', () => {
    const { dialog } = renderDialog()

    const details = technicalDetails(dialog)

    expect(details.open).toBe(false)
    expect(details).toHaveTextContent('Error')
  })

  it('the details hold the error, each fault with its path, the format version, and the build', () => {
    const { dialog } = renderDialog()

    const details = technicalDetails(dialog)

    expect(details).toHaveTextContent(DETAILS.error)
    expect(details).toHaveTextContent('Paths in the document')
    for (const fault of DETAILS.faults) {
      expect(details).toHaveTextContent(fault.path)
      expect(details).toHaveTextContent(fault.message)
    }
    expect(details).toHaveTextContent('Format version')
    expect(details).toHaveTextContent(String(FORMAT_VERSION))
    expect(details).toHaveTextContent('Build')
    expect(details).toHaveTextContent(DETAILS.build)
  })

  it('the details leave the format version out when it is not known', () => {
    const withoutVersion: FailedOpenDetails = {
      error: DETAILS.error,
      faults: DETAILS.faults,
      build: DETAILS.build,
      removedPaths: [],
    }
    const { dialog } = renderDialog({ details: withoutVersion })

    const details = technicalDetails(dialog)

    expect(details).not.toHaveTextContent('Format version')
    expect(details).toHaveTextContent(DETAILS.error)
  })

  it('the details list each path that the repair removes', () => {
    const removedPaths = ['/meta/x-older', '/rooms/2/x-stale']
    const { dialog } = renderDialog({ details: { ...DETAILS, removedPaths } })

    const details = technicalDetails(dialog)

    expect(details).toHaveTextContent('Paths that the repair removes')
    for (const path of removedPaths) expect(details).toHaveTextContent(path)
  })
})

describe('the controls and the repair offer of the failed-open dialog', () => {
  it('has the controls Close and Export, and Close has the first focus', () => {
    const { dialog } = renderDialog({ onExport: vi.fn() })

    expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus()
    expect(within(dialog).getByRole('button', { name: 'Export' })).toBeInTheDocument()
  })

  it.each(CAUSES_THAT_CAN_RETRY)(
    'shows "Try again" for the cause %s when a handler is given',
    (cause) => {
      renderDialog({ cause, onTryAgain: vi.fn() })

      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    },
  )

  it.each(CAUSES_THAT_CANNOT_RETRY)(
    'shows no "Try again" for the cause %s, even with a handler',
    (cause) => {
      renderDialog({ cause, onTryAgain: vi.fn() })

      expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    },
  )

  it.each(CAUSES_THAT_CAN_RETRY)(
    'shows no "Try again" for the cause %s without a handler',
    (cause) => {
      renderDialog({ cause })

      expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    },
  )

  it('has no control that starts a new project', () => {
    renderDialog({ onExport: vi.fn() })

    const names = screen.getAllByRole('button').map((button) => button.textContent)

    expect(names).toEqual(['Close', 'Export'])
  })

  it('with every handler, a retry cause, and an offer, has exactly Close, Try again, Export, and Open with the repair', () => {
    renderDialog({
      cause: 'storage-unavailable',
      onTryAgain: vi.fn(),
      onExport: vi.fn(),
      onOpenWithRepair: vi.fn(),
      repairSentences: ['It removes 1 field that the format does not define.'],
    })

    const names = screen.getAllByRole('button').map((button) => button.textContent)

    expect([...names].sort()).toEqual(['Close', 'Export', 'Open with the repair', 'Try again'])
  })

  it('Escape and Close call onClose, and Export calls onExport', async () => {
    const onClose = vi.fn()
    const onExport = vi.fn()
    const { user } = renderDialog({ onClose, onExport })

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(onExport).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Export' }))

    expect(onExport).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('shows no Export without a handler', () => {
    renderDialog()

    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument()
  })

  it('with an offer, shows the opening sentence, the sentences of the repair, and "Open with the repair"', async () => {
    const repairSentences = [
      'It removes the extra data from 2 paint entries.',
      'It removes 1 field that the format does not define.',
    ]
    const onOpenWithRepair = vi.fn()
    const { user, dialog } = renderDialog({ repairSentences, onOpenWithRepair })

    expect(dialog).toHaveTextContent(REPAIR_INTRODUCTION)
    for (const sentence of repairSentences) expect(dialog).toHaveTextContent(sentence)
    await user.click(within(dialog).getByRole('button', { name: 'Open with the repair' }))

    expect(onOpenWithRepair).toHaveBeenCalledOnce()
  })

  it.each([undefined, []])('without an offer (%j), shows no repair control', (repairSentences) => {
    const { dialog } = renderDialog({ repairSentences, onOpenWithRepair: vi.fn() })

    expect(
      within(dialog).queryByRole('button', { name: 'Open with the repair' }),
    ).not.toBeInTheDocument()
    expect(dialog).not.toHaveTextContent(REPAIR_INTRODUCTION)
  })

  it('is an alert dialog that its title labels and its sentences describe', () => {
    const { dialog } = renderDialog()

    expect(screen.getByRole('alertdialog', { name: TITLE })).toBe(dialog)
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription(
      expect.stringContaining('A part of the project breaks the format rules.'),
    )
    expect(dialog).toHaveAccessibleDescription(expect.stringContaining(KEPT_UNCHANGED))
    expect(dialog).toHaveAccessibleDescription(expect.stringContaining(EXPORT_SENTENCE))
  })
})
