import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ProjectCardModel } from '../../session'
import { ProjectsPage, type ProjectsPageProps } from './projects-page'

/** Test support: the cards and the rendering that the tests of the Projects page share. */

/** A card for a stored project named Hubbard House in the browser, with `overrides` applied. */
export function cardOf(overrides: Partial<ProjectCardModel> = {}): ProjectCardModel {
  return {
    id: 'hubbard',
    name: 'Hubbard House',
    lastChangedAt: undefined,
    floorCount: undefined,
    location: 'browser',
    preview: 'none',
    stateLines: [],
    actions: ['rename', 'export', 'delete'],
    ...overrides,
  }
}

/** Renders the page, with the address of each project as `#/project/<id>`, and gives a user. */
export function renderPage(props: Partial<ProjectsPageProps> = {}) {
  const hrefFor = (id: string) => `#/project/${id}`
  render(<ProjectsPage cards={[]} hrefFor={hrefFor} {...props} />)
  return userEvent.setup()
}

/** The link of the card of the project named `name`. */
export const linkNamed = (name: string) => screen.getByRole('link', { name })
