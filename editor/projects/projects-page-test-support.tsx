import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { ProjectCardModel } from '../../session'
import { ProjectsPage, type ProjectCardActions, type ProjectsPageProps } from './projects-page'

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

/** A rename handler that stores every name: it records its calls and resolves true. */
export function acceptsRename() {
  return vi.fn<NonNullable<ProjectCardActions['onRename']>>(() => Promise.resolve(true))
}

/**
 * Renders the page with a rename handler as its only card action. Gives a user, the handler, and a
 * function that shows another list of cards in the same page.
 */
export function renderRenamingPage(
  cards: readonly ProjectCardModel[],
  onRename: ReturnType<typeof acceptsRename> = acceptsRename(),
) {
  const pageOf = (shown: readonly ProjectCardModel[]) => (
    <ProjectsPage cards={shown} hrefFor={(id) => `#/project/${id}`} cardActions={{ onRename }} />
  )
  const view = render(pageOf(cards))
  return {
    user: userEvent.setup(),
    onRename,
    showCards: (shown: readonly ProjectCardModel[]) => view.rerender(pageOf(shown)),
  }
}

/** An export handler that records its calls. */
export function acceptsExport() {
  return vi.fn<NonNullable<ProjectCardActions['onExport']>>()
}

/** Renders the page with the given card actions, the address of each project being `#/project/<id>`, and gives a user. */
export function renderPageWithCardActions(
  cards: readonly ProjectCardModel[],
  cardActions: ProjectCardActions,
) {
  render(
    <ProjectsPage cards={cards} hrefFor={(id) => `#/project/${id}`} cardActions={cardActions} />,
  )
  return userEvent.setup()
}

/** The "..." control of the card of the project named `name`. */
export const actionsControlOf = (name: string) =>
  screen.getByRole('button', { name: `Actions for ${name}` })

/** The list item of the card of the project named `name`. */
export function cardNamed(name: string): HTMLElement {
  const item = linkNamed(name).closest('li')
  if (item === null) throw new Error(`The card of ${name} is not in a list item`)
  return item
}
