import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  acceptsExport,
  acceptsRename,
  actionsControlOf,
  cardNamed,
  cardOf,
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
