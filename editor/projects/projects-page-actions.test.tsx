import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  acceptsDelete,
  acceptsExport,
  acceptsRemoval,
  acceptsRename,
  actionsControlOf,
  cardNamed,
  cardOf,
  folderCardOf,
  renderChangingPage,
  renderPage,
  renderPageWithCardActions,
  renderRenamingPage,
} from './projects-page-test-support'

afterEach(cleanup)

const HUBBARD = 'Hubbard House'
const QUEEN_ANNE = 'Queen Anne Cottage'
const NEW_NAME = 'Hubbard Manor'

const hubbard = cardOf()
const queenAnne = cardOf({ id: 'queen-anne', name: QUEEN_ANNE })
const heldElsewhere = cardOf({ id: 'held', name: 'Held House', actions: ['export'] })

const formOf = (name: string) =>
  within(cardNamed(name)).queryByRole('textbox', { name: 'Project name' })

describe('the card menu of the Projects page', () => {
  it('shows no "..." control on any card without cardActions', () => {
    renderPage({ cards: [hubbard, queenAnne] })

    expect(screen.queryByRole('button', { name: /^Actions for/ })).toBeNull()
  })

  it('lists Rename only, with a rename handler only, and shows no control on a card with no action to offer', async () => {
    const { user } = renderRenamingPage([hubbard, heldElsewhere])

    await user.click(actionsControlOf(HUBBARD))

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Rename'])
    expect(screen.queryByRole('button', { name: 'Actions for Held House' })).toBeNull()
  })
})

describe('the rename form of a card', () => {
  it('shows on the card that Rename was chosen on, and moves to the card of a second Rename', async () => {
    const { user } = renderRenamingPage([hubbard, queenAnne])

    await user.click(actionsControlOf(HUBBARD))
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }))
    expect(formOf(HUBBARD)).toHaveValue(HUBBARD)
    await user.click(actionsControlOf(QUEEN_ANNE))
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }))

    expect(formOf(QUEEN_ANNE)).toHaveValue(QUEEN_ANNE)
    expect(screen.getAllByRole('textbox', { name: 'Project name' })).toHaveLength(1)
  })

  it('calls onRename with the id and the name on Save, closes when it resolves true, and focuses the "..." control', async () => {
    const { user, onRename } = renderRenamingPage([hubbard, queenAnne])
    await user.click(actionsControlOf(HUBBARD))
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }))
    await user.clear(screen.getByRole('textbox', { name: 'Project name' }))
    await user.type(screen.getByRole('textbox', { name: 'Project name' }), NEW_NAME)

    await user.click(screen.getByRole('button', { name: 'Save name' }))

    expect(onRename.mock.calls).toEqual([['hubbard', NEW_NAME]])
    await waitFor(() => expect(formOf(HUBBARD)).toBeNull())
    expect(actionsControlOf(HUBBARD)).toHaveFocus()
  })

  it('stays open with the typed name when onRename resolves false', async () => {
    const refuses = acceptsRename()
    refuses.mockResolvedValue(false)
    const { user, onRename } = renderRenamingPage([hubbard], refuses)
    await user.click(actionsControlOf(HUBBARD))
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }))
    await user.clear(screen.getByRole('textbox', { name: 'Project name' }))
    await user.type(screen.getByRole('textbox', { name: 'Project name' }), NEW_NAME)

    await user.click(screen.getByRole('button', { name: 'Save name' }))

    await waitFor(() => expect(onRename).toHaveBeenCalledOnce())
    expect(formOf(HUBBARD)).toHaveValue(NEW_NAME)
  })

  it('keeps the form of another card open, with its typed text and its focus, when an earlier save resolves true', async () => {
    let finishSave: (saved: boolean) => void = () => undefined
    const slowFirstSave = acceptsRename()
    slowFirstSave.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (finishSave = resolve)),
    )
    const { user } = renderRenamingPage([hubbard, queenAnne], slowFirstSave)
    await user.click(actionsControlOf(HUBBARD))
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }))
    await user.clear(screen.getByRole('textbox', { name: 'Project name' }))
    await user.type(screen.getByRole('textbox', { name: 'Project name' }), NEW_NAME)
    await user.click(screen.getByRole('button', { name: 'Save name' }))
    await user.click(actionsControlOf(QUEEN_ANNE))
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }))
    await user.type(screen.getByRole('textbox', { name: 'Project name' }), ' Annex')

    await act(async () => finishSave(true))

    const form = formOf(QUEEN_ANNE)
    expect(form).toHaveValue(`${QUEEN_ANNE} Annex`)
    expect(form).toHaveFocus()
  })

  it('closes on Cancel, calls nothing, and focuses the "..." control', async () => {
    const { user, onRename } = renderRenamingPage([hubbard])
    await user.click(actionsControlOf(HUBBARD))
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }))

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(formOf(HUBBARD)).toBeNull()
    expect(onRename).not.toHaveBeenCalled()
    expect(actionsControlOf(HUBBARD)).toHaveFocus()
  })

  it('goes away with its card when the card leaves the list', async () => {
    const { user, showCards } = renderRenamingPage([hubbard, queenAnne])
    await user.click(actionsControlOf(HUBBARD))
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }))

    showCards([queenAnne])

    expect(screen.queryByRole('textbox', { name: 'Project name' })).toBeNull()
    showCards([hubbard, queenAnne])
    expect(formOf(HUBBARD)).toBeNull()
  })
})

describe('the actions that the card menu hands to the page', () => {
  it('calls onExport with the id of the card at once when Export is chosen, also on a card that another tab holds', async () => {
    const onExport = acceptsExport()
    const user = renderPageWithCardActions([hubbard, heldElsewhere], { onExport })

    await user.click(actionsControlOf(HUBBARD))
    await user.click(screen.getByRole('menuitem', { name: 'Export' }))
    await user.click(actionsControlOf('Held House'))
    await user.click(screen.getByRole('menuitem', { name: 'Export' }))

    expect(onExport.mock.calls).toEqual([['hubbard'], ['held']])
  })

  it('lists Export after Rename on a card, in the order of the card', async () => {
    const user = renderPageWithCardActions([hubbard], {
      onRename: acceptsRename(),
      onExport: acceptsExport(),
    })

    await user.click(actionsControlOf(HUBBARD))

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Rename',
      'Export',
    ])
  })

  it('hands the chosen action to its own handler: Export calls only onExport, and Rename only opens the form', async () => {
    const onRename = acceptsRename()
    const onExport = acceptsExport()
    const user = renderPageWithCardActions([hubbard], { onRename, onExport })

    await user.click(actionsControlOf(HUBBARD))
    await user.click(screen.getByRole('menuitem', { name: 'Export' }))
    expect(onExport).toHaveBeenCalledOnce()
    expect(onRename).not.toHaveBeenCalled()
    expect(formOf(HUBBARD)).toBeNull()

    await user.click(actionsControlOf(HUBBARD))
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }))
    expect(formOf(HUBBARD)).toHaveValue(HUBBARD)
    expect(onExport).toHaveBeenCalledOnce()
    expect(onRename).not.toHaveBeenCalled()
  })
})

const FOLDER = 'Folder House'
const DELETE_QUESTION = `Delete "${HUBBARD}"?`

const entriesOf = () => screen.getAllByRole('menuitem').map((item) => item.textContent)

describe('the delete and remove actions that the card menu hands to the page', () => {
  it('lists Delete after Export on an ordinary card and Remove from list after Export on a folder card', async () => {
    const handlers = {
      onRename: acceptsRename(),
      onExport: acceptsExport(),
      onDelete: acceptsDelete(),
      onRemoveFromList: acceptsRemoval(),
    }
    const user = renderPageWithCardActions([hubbard, folderCardOf()], handlers)

    await user.click(actionsControlOf(HUBBARD))
    expect(entriesOf()).toEqual(['Rename', 'Export', 'Delete'])
    await user.keyboard('{Escape}')
    await user.click(actionsControlOf(FOLDER))

    expect(entriesOf()).toEqual(['Rename', 'Export', 'Remove from list'])
  })

  it('shows no Delete entry without an onDelete handler and no Remove from list entry without an onRemoveFromList handler', async () => {
    const onExport = acceptsExport()
    const user = renderPageWithCardActions([hubbard, folderCardOf()], { onExport })

    await user.click(actionsControlOf(HUBBARD))
    expect(entriesOf()).toEqual(['Export'])
    await user.keyboard('{Escape}')
    await user.click(actionsControlOf(FOLDER))

    expect(entriesOf()).toEqual(['Export'])
  })

  it('shows the delete dialog of the card when Delete is chosen, and calls nothing yet', async () => {
    const onDelete = acceptsDelete()
    const user = renderPageWithCardActions([hubbard, queenAnne], { onDelete })

    await user.click(actionsControlOf(HUBBARD))
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))

    expect(screen.getByRole('alertdialog', { name: DELETE_QUESTION })).toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('closes the dialog on Cancel, calls nothing, and focuses the "..." control', async () => {
    const onDelete = acceptsDelete()
    const user = renderPageWithCardActions([hubbard], { onDelete })
    await user.click(actionsControlOf(HUBBARD))
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(onDelete).not.toHaveBeenCalled()
    expect(actionsControlOf(HUBBARD)).toHaveFocus()
  })

  it('closes the dialog on Delete project, calls onDelete once with the id, and focuses the main region', async () => {
    const onDelete = acceptsDelete()
    const user = renderPageWithCardActions([hubbard, queenAnne], { onDelete })
    await user.click(actionsControlOf(HUBBARD))
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))

    await user.click(screen.getByRole('button', { name: 'Delete project' }))

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(onDelete.mock.calls).toEqual([['hubbard']])
    expect(screen.getByRole('main', { name: 'Projects' })).toHaveFocus()
  })

  it('calls onRemoveFromList with the id at once, and shows no dialog', async () => {
    const onRemoveFromList = acceptsRemoval()
    const user = renderPageWithCardActions([hubbard, folderCardOf()], { onRemoveFromList })

    await user.click(actionsControlOf(FOLDER))
    await user.click(screen.getByRole('menuitem', { name: 'Remove from list' }))

    expect(onRemoveFromList.mock.calls).toEqual([['folder']])
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('takes the dialog away with its card when the card leaves the list', async () => {
    const { user, showCards } = renderChangingPage([hubbard, queenAnne], {
      onDelete: acceptsDelete(),
    })
    await user.click(actionsControlOf(HUBBARD))
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))

    showCards([queenAnne])

    expect(screen.queryByRole('alertdialog')).toBeNull()
    showCards([hubbard, queenAnne])
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})
