import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import {
  acceptsExport,
  acceptsRemoval,
  actionsControlOf,
  cardOf,
  renderPageWithCardActions,
} from './projects-page-test-support'

afterEach(cleanup)

const FOLDER_NAME = 'Folder House'

/** A card for a project that a folder holds beside a second plan file. */
const folderCardWithSecondFile = cardOf({
  id: 'folder',
  name: FOLDER_NAME,
  location: { folderName: 'Old house' },
  actions: ['rename', 'export', 'choose-file', 'remove-from-list'],
})

/** Renders the page with an export, a choice, and a removal handler, and gives a user and the handlers. */
function renderFolderCardWithSecondFile() {
  const handlers = {
    onExport: acceptsExport(),
    onChooseFile: vi.fn(),
    onRemoveFromList: acceptsRemoval(),
  }
  const user = renderPageWithCardActions([folderCardWithSecondFile], handlers)
  return { user, ...handlers }
}

describe('the card actions of a folder project with a second plan file', () => {
  it('offers Export, Choose a plan file, and Remove from list, in that order', async () => {
    const { user } = renderFolderCardWithSecondFile()

    await user.click(actionsControlOf(FOLDER_NAME))

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Export',
      'Choose a plan file',
      'Remove from list',
    ])
  })

  it('hands each chosen action to its own handler with the id of the project', async () => {
    const { user, onExport, onChooseFile, onRemoveFromList } = renderFolderCardWithSecondFile()

    for (const name of ['Export', 'Choose a plan file', 'Remove from list']) {
      await user.click(actionsControlOf(FOLDER_NAME))
      await user.click(screen.getByRole('menuitem', { name }))
    }

    expect(onExport.mock.calls).toEqual([['folder']])
    expect(onChooseFile.mock.calls).toEqual([['folder']])
    expect(onRemoveFromList.mock.calls).toEqual([['folder']])
  })
})
