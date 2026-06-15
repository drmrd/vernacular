import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProjectMenu } from './project-menu'

afterEach(cleanup)

describe('ProjectMenu', () => {
  it('renders nothing when no project handlers are provided', () => {
    const { container } = render(<ProjectMenu />)
    expect(container.firstChild).toBeNull()
  })

  it('opens the menu and calls New project from its item', async () => {
    const user = userEvent.setup()
    const onNewProject = vi.fn()
    render(<ProjectMenu onNewProject={onNewProject} onOpenFolder={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /project menu/i }))
    await user.click(screen.getByRole('menuitem', { name: /new project/i }))
    expect(onNewProject).toHaveBeenCalledTimes(1)
  })

  it('lists recent projects as menu items and opens the chosen one', async () => {
    const user = userEvent.setup()
    const onOpenRecent = vi.fn()
    render(
      <ProjectMenu
        onOpenRecent={onOpenRecent}
        recentProjects={[{ id: 'p1', name: 'Eastmore Farmstead' }]}
      />,
    )
    await user.click(screen.getByRole('button', { name: /project menu/i }))
    await user.click(screen.getByRole('menuitem', { name: /eastmore farmstead/i }))
    expect(onOpenRecent).toHaveBeenCalledWith('p1')
  })
})
