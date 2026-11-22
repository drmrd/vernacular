import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ProjectCardAction } from '../../session'
import { ProjectCardMenu } from './project-card-menu'
import {
  acceptsExport,
  actionsControlOf,
  cardOf,
  renderPageWithCardActions,
} from './projects-page-test-support'

afterEach(cleanup)

const PROJECT = 'Hubbard House'
const CONTROL = `Actions for ${PROJECT}`

function renderMenu(actions: readonly ProjectCardAction[], onAction = vi.fn()) {
  render(<ProjectCardMenu projectName={PROJECT} actions={actions} onAction={onAction} />)
  return { user: userEvent.setup(), control: screen.getByRole('button', { name: CONTROL }) }
}

describe('ProjectCardMenu', () => {
  it('names its control after the project and opens a menu from it', async () => {
    const { user, control } = renderMenu(['export'])
    expect(control).toHaveAttribute('aria-haspopup')
    expect(control).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).toBeNull()

    await user.click(control)

    expect(control).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  const actionSets: [string, ProjectCardAction[], string[]][] = [
    ['a workspace project', ['rename', 'export', 'delete'], ['Rename', 'Export', 'Delete']],
    [
      'a folder project',
      ['rename', 'export', 'remove-from-list'],
      ['Rename', 'Export', 'Remove from list'],
    ],
    [
      'a project with a second plan file',
      ['rename', 'export', 'choose-file', 'delete'],
      ['Rename', 'Export', 'Choose a plan file', 'Delete'],
    ],
    ['a project open in another tab', ['export'], ['Export']],
    [
      'a folder project that did not open',
      ['export', 'remove-from-list'],
      ['Export', 'Remove from list'],
    ],
  ]

  it.each(actionSets)(
    'lists exactly the actions of %s, in order',
    async (_kind, actions, texts) => {
      const { user, control } = renderMenu(actions)
      await user.click(control)
      const labels = screen.getAllByRole('menuitem').map((item) => item.textContent)
      expect(labels).toEqual(texts)
    },
  )

  it('reports the chosen action once and closes the menu', async () => {
    const onAction = vi.fn()
    const { user, control } = renderMenu(['rename', 'export', 'delete'], onAction)
    await user.click(control)

    await user.click(screen.getByRole('menuitem', { name: 'Export' }))

    expect(onAction.mock.calls).toEqual([['export']])
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes the menu and returns focus to its control when Escape is pressed', async () => {
    const { user, control } = renderMenu(['rename', 'export'])
    await user.click(control)
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).toBeNull()
    expect(control).toHaveFocus()
  })

  it('renders nothing when the project has no actions', () => {
    const { container } = render(
      <ProjectCardMenu projectName={PROJECT} actions={[]} onAction={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })
})

describe('the card menu of a project with a second plan file', () => {
  const withSecondFile = cardOf({ actions: ['rename', 'export', 'choose-file', 'delete'] })

  it('reports the chosen action once', async () => {
    const onAction = vi.fn()
    const { user, control } = renderMenu(['export', 'choose-file', 'delete'], onAction)
    await user.click(control)

    await user.click(screen.getByRole('menuitem', { name: 'Choose a plan file' }))

    expect(onAction.mock.calls).toEqual([['choose-file']])
  })

  it('offers Choose a plan file between Export and the removal when the page has a handler for it', async () => {
    const user = renderPageWithCardActions([withSecondFile], {
      onExport: acceptsExport(),
      onChooseFile: vi.fn(),
      onDelete: vi.fn(),
    })

    await user.click(actionsControlOf(PROJECT))

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Export',
      'Choose a plan file',
      'Delete',
    ])
  })

  it('calls the handler of the page with the id of the project when Choose a plan file is chosen', async () => {
    const onChooseFile = vi.fn()
    const user = renderPageWithCardActions([withSecondFile], {
      onExport: acceptsExport(),
      onChooseFile,
    })
    await user.click(actionsControlOf(PROJECT))

    await user.click(screen.getByRole('menuitem', { name: 'Choose a plan file' }))

    expect(onChooseFile.mock.calls).toEqual([[withSecondFile.id]])
  })
})
