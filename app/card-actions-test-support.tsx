import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { chooseAnActionOf } from './projects-screen-test-support'

/** Test support: the steps of the actions of a card on the Projects page that the tests share. */

/** The field of the rename form that shows on a card, or null when no form shows. */
export function theRenameField(): HTMLElement | null {
  return screen.queryByRole('textbox', { name: 'Project name' })
}

/** Opens the rename form of the card of `name`, replaces the name with `newName`, and saves it. */
export async function renameFromTheCard(name: string, newName: string): Promise<void> {
  await chooseAnActionOf(name, 'Rename')
  const field = await screen.findByRole('textbox', { name: 'Project name' })
  await userEvent.clear(field)
  await userEvent.type(field, newName)
  await userEvent.click(screen.getByRole('button', { name: 'Save name' }))
}
