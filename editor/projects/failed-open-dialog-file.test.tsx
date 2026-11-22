import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FailedOpenDialog,
  type FailedOpenCause,
  type FailedOpenDetails,
  type FailedOpenDialogProps,
} from './failed-open-dialog'

afterEach(cleanup)

const FILE_TITLE = 'This file did not open.'
const STORED_TITLE = 'This project did not open.'
const LIMIT_SENTENCE = 'The file is larger than Vernacular can open.'
const LIMIT_DETAIL = 'The file is larger than 512 MB.'

const DETAILS: FailedOpenDetails = {
  error: LIMIT_DETAIL,
  faults: [],
  build: '0.3.0',
  removedPaths: [],
}

const CAUSE_SENTENCES: readonly (readonly [string, FailedOpenCause])[] = [
  ['A part of the project breaks the format rules.', 'format-rules'],
  ['A newer version of Vernacular made this project.', 'newer-version'],
  ['The file is not a Vernacular project.', 'not-a-project'],
  ['Vernacular could not bring this project up to the current format.', 'migration-failed'],
  [LIMIT_SENTENCE, 'file-too-large'],
]

/** Renders the dialog for a file that did not open, with the given props changed. */
function renderFileDialog(changes: Partial<FailedOpenDialogProps> = {}): HTMLElement {
  const props: FailedOpenDialogProps = {
    cause: 'format-rules',
    details: DETAILS,
    source: 'file',
    onClose: vi.fn(),
    ...changes,
  }
  render(<FailedOpenDialog {...props} />)
  return screen.getByRole('alertdialog')
}

describe('the dialog for a file that did not open', () => {
  it('for a file, shows the title and the sentences of a file', () => {
    const dialog = renderFileDialog({ cause: 'not-a-project' })

    expect(screen.getByRole('heading', { name: FILE_TITLE })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: STORED_TITLE })).not.toBeInTheDocument()
    expect(dialog).toHaveTextContent('The file is not a Vernacular project.')
    expect(dialog).not.toHaveTextContent('kept unchanged')
    expect(dialog).not.toHaveTextContent('export a copy')
  })

  it.each(CAUSE_SENTENCES)('says "%s" for the cause %s', (sentence, cause) => {
    expect(renderFileDialog({ cause })).toHaveTextContent(sentence)
  })

  it('for a file over a limit, says "The file is larger than Vernacular can open."', () => {
    const dialog = renderFileDialog({ cause: 'file-too-large' })

    expect(dialog).toHaveTextContent(LIMIT_SENTENCE)
    expect(dialog.querySelector('details')).toHaveTextContent(LIMIT_DETAIL)
  })

  it('shows no Export, even when a handler for it is given', () => {
    renderFileDialog({ onExport: vi.fn() })

    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })
})
