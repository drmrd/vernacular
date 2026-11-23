import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TwoFilesDialog, type TwoFilesDialogProps } from './two-files-dialog'

afterEach(cleanup)

const TITLE = 'This project has two plan files'
const KEEP_BOTH = 'Keep both plan files'
const OPEN_AND_KEEP_BOTH = 'Open and keep both plan files'
const OPEN_AS_NEW = 'Open the second plan file as a new project'
const REPLACE = 'Replace vernacular.json with the second plan file'
const REMOVE = 'Remove the second plan file'
const CANCEL = 'Cancel'

const SECOND_FILE_NAME = 'vernacular.format-18.json'
const MAIN_CHANGED_AT = '2026-03-01T09:00:00.000Z'
const SECOND_CHANGED_AT = '2026-03-05T17:30:00.000Z'

const NEWER_MAIN_SENTENCE =
  'A newer version of Vernacular saved the plan file vernacular.json. This version cannot read it. ' +
  `The second plan file, ${SECOND_FILE_NAME}, holds the changes that this version saved.`
const NEW_PROJECT_SENTENCE =
  "The new project is stored in this browser. The second plan file moves to the project's backups."
const REPLACE_WARNING =
  "The plan file vernacular.json moves to the project's backups. No control brings it back. You cannot undo this action."
const REMOVE_SENTENCE = "The second plan file moves to the project's backups."

/** The time as the card writes it: the medium date and the short time of the user's locale. */
function cardTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  )
}

/** The sentence of the both-readable state, with `main` and `second` as the two phrases of time. */
function bothReadableSentence(main: string, second: string): string {
  return (
    `The plan file vernacular.json changed ${main}. ` +
    `The second plan file, ${SECOND_FILE_NAME}, changed ${second}. ` +
    `An older version of Vernacular saved the second plan file.`
  )
}

/**
 * Renders the dialog as the page does: a handler for each choice, the remove handler in the
 * both-readable state, and the cancel handler before an open. Gives a user, the handlers, and the dialog.
 */
function renderDialog(changes: Partial<TwoFilesDialogProps> = {}) {
  const handlers = {
    onKeepBoth: vi.fn(),
    onOpenAsNew: vi.fn(),
    onReplace: vi.fn(),
    onRemove: vi.fn(),
    onCancel: vi.fn(),
  }
  const state = changes.state ?? 'newer-main'
  render(
    <TwoFilesDialog
      state={state}
      secondFileName={SECOND_FILE_NAME}
      onKeepBoth={handlers.onKeepBoth}
      onOpenAsNew={handlers.onOpenAsNew}
      onReplace={handlers.onReplace}
      {...(state === 'both-readable' ? { onRemove: handlers.onRemove } : {})}
      {...(changes.beforeOpen === true ? { onCancel: handlers.onCancel } : {})}
      {...changes}
    />,
  )
  const dialog = screen.getByRole('alertdialog')
  return { user: userEvent.setup(), handlers, dialog }
}

/** How many times `sentence` occurs in the text of `dialog`, with the white space of the page collapsed. */
function occurrencesIn(dialog: HTMLElement, sentence: string): number {
  const text = (dialog.textContent ?? '').replace(/\s+/g, ' ')
  return text.split(sentence).length - 1
}

/** The names of the buttons of `dialog`, in the order they show. */
function buttonNames(dialog: HTMLElement): Array<string | null> {
  return within(dialog)
    .getAllByRole('button')
    .map((button) => button.textContent)
}

describe('the dialog that offers the choice between the two plan files of a project', () => {
  it('is a modal alert dialog that the title labels', () => {
    const { dialog } = renderDialog()

    expect(screen.getByRole('alertdialog', { name: TITLE })).toBe(dialog)
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('offers keeping both, opening the second file as a new project, and replacing, beside a newer main file', () => {
    const { dialog } = renderDialog({ state: 'newer-main' })

    expect(buttonNames(dialog)).toEqual([KEEP_BOTH, OPEN_AS_NEW, REPLACE])
  })

  it('adds the removal of the second file when the build reads both files', () => {
    const { dialog } = renderDialog({ state: 'both-readable' })

    expect(buttonNames(dialog)).toEqual([KEEP_BOTH, OPEN_AS_NEW, REPLACE, REMOVE])
  })

  it('says that a newer version saved the main file and that the second file holds the changes of this version', () => {
    const { dialog } = renderDialog({ state: 'newer-main' })

    expect(dialog).toHaveTextContent(NEWER_MAIN_SENTENCE)
  })

  it('names the time of each file in the format of the card when the build reads both files', () => {
    const { dialog } = renderDialog({
      state: 'both-readable',
      mainChangedAt: MAIN_CHANGED_AT,
      secondChangedAt: SECOND_CHANGED_AT,
    })

    expect(dialog).toHaveTextContent(
      bothReadableSentence(`on ${cardTime(MAIN_CHANGED_AT)}`, `on ${cardTime(SECOND_CHANGED_AT)}`),
    )
  })

  it.each([
    ['no time', undefined],
    ['a time that is no date', 'last Tuesday, probably'],
  ])('says "at an unknown time" for a file with %s', (_label, changedAt) => {
    const given = changedAt === undefined ? {} : { mainChangedAt: changedAt }
    const { dialog } = renderDialog({
      state: 'both-readable',
      secondChangedAt: SECOND_CHANGED_AT,
      ...given,
    })

    expect(dialog).toHaveTextContent(
      bothReadableSentence('at an unknown time', `on ${cardTime(SECOND_CHANGED_AT)}`),
    )
  })

  it('says where the new project is stored and where the second file goes', () => {
    const { dialog } = renderDialog()

    expect(dialog).toHaveTextContent(NEW_PROJECT_SENTENCE)
  })

  it('describes the replace control by its warning, which says that no control brings the file back', () => {
    const { dialog } = renderDialog()

    const replace = within(dialog).getByRole('button', { name: REPLACE })
    expect(replace).toHaveAccessibleDescription(REPLACE_WARNING)
  })

  it('says twice that the second file moves to the backups when the build reads both files: with the new project and with the removal', () => {
    const { dialog } = renderDialog({ state: 'both-readable' })

    expect(occurrencesIn(dialog, REMOVE_SENTENCE)).toBe(2)
  })

  it('shows no removal beside a newer main file, and says only once that the second file moves to the backups', () => {
    const { dialog } = renderDialog({ state: 'newer-main' })

    expect(within(dialog).queryByRole('button', { name: REMOVE })).not.toBeInTheDocument()
    expect(occurrencesIn(dialog, REMOVE_SENTENCE)).toBe(1)
  })

  it('gives "Keep both plan files" the first focus, as the primary control', () => {
    const { dialog } = renderDialog()

    const keepBoth = within(dialog).getByRole('button', { name: KEEP_BOTH })
    expect(keepBoth).toHaveClass('ds-button--primary')
    expect(keepBoth).toHaveAttribute('data-initial-focus')
    expect(keepBoth).toHaveFocus()
  })

  it('shows no Cancel without a cancel handler', () => {
    const { dialog } = renderDialog({ state: 'both-readable' })

    expect(within(dialog).queryByRole('button', { name: CANCEL })).not.toBeInTheDocument()
  })
})

describe('the dialog before a project opens', () => {
  it('reads "Open and keep both plan files" on the primary control, with the first focus, in place of "Keep both plan files"', () => {
    const { dialog } = renderDialog({ beforeOpen: true })

    const primary = within(dialog).getByRole('button', { name: OPEN_AND_KEEP_BOTH })
    expect(primary).toHaveClass('ds-button--primary')
    expect(primary).toHaveAttribute('data-initial-focus')
    expect(primary).toHaveFocus()
    expect(within(dialog).queryByRole('button', { name: KEEP_BOTH })).not.toBeInTheDocument()
  })

  it('shows Cancel after the choices', () => {
    const { dialog } = renderDialog({ state: 'both-readable', beforeOpen: true })

    expect(buttonNames(dialog)).toEqual([OPEN_AND_KEEP_BOTH, OPEN_AS_NEW, REPLACE, REMOVE, CANCEL])
  })

  it('calls the keep-both handler once when the primary control is chosen, and cancels on Cancel', async () => {
    const { user, handlers } = renderDialog({ beforeOpen: true })

    await user.click(screen.getByRole('button', { name: OPEN_AND_KEEP_BOTH }))
    expect(handlers.onKeepBoth).toHaveBeenCalledOnce()
    expect(handlers.onCancel).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: CANCEL }))
    expect(handlers.onCancel).toHaveBeenCalledOnce()
    expect(handlers.onKeepBoth).toHaveBeenCalledOnce()
  })

  it('Escape cancels, and does not keep both files', async () => {
    const { user, handlers } = renderDialog({ beforeOpen: true })

    await user.keyboard('{Escape}')

    expect(handlers.onCancel).toHaveBeenCalledOnce()
    expect(handlers.onKeepBoth).not.toHaveBeenCalled()
  })
})

describe('the choices of the dialog', () => {
  const CHOICES = [
    [KEEP_BOTH, 'onKeepBoth'],
    [OPEN_AS_NEW, 'onOpenAsNew'],
    [REPLACE, 'onReplace'],
    [REMOVE, 'onRemove'],
  ] as const

  it.each(CHOICES)('"%s" calls its own handler once and no other', async (name, handlerName) => {
    const { user, handlers } = renderDialog({ state: 'both-readable' })

    await user.click(screen.getByRole('button', { name }))

    for (const [key, handler] of Object.entries(handlers)) {
      expect(handler).toHaveBeenCalledTimes(key === handlerName ? 1 : 0)
    }
  })

  it('Escape keeps both files when no open is waiting', async () => {
    const { user, handlers } = renderDialog({ state: 'both-readable' })

    await user.keyboard('{Escape}')

    expect(handlers.onKeepBoth).toHaveBeenCalledOnce()
    expect(handlers.onReplace).not.toHaveBeenCalled()
    expect(handlers.onRemove).not.toHaveBeenCalled()
    expect(handlers.onOpenAsNew).not.toHaveBeenCalled()
  })
})

describe('the dialog while a choice runs', () => {
  it('disables every control', () => {
    const { dialog } = renderDialog({ state: 'both-readable', beforeOpen: true, busy: true })

    const buttons = within(dialog).getAllByRole('button')
    expect(buttons).toHaveLength(5)
    for (const button of buttons) expect(button).toBeDisabled()
  })

  it('does nothing on Escape', async () => {
    const { user, handlers, dialog } = renderDialog({ busy: true })
    const shade = dialog.parentElement as HTMLElement
    act(() => shade.focus())
    expect(shade).toContainElement(document.activeElement as HTMLElement)

    await user.keyboard('{Escape}')

    for (const handler of Object.values(handlers)) expect(handler).not.toHaveBeenCalled()
  })
})
