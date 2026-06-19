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

  it('routes the trigger and items through the design-system primitives while preserving menu semantics', async () => {
    const user = userEvent.setup()
    const onNewProject = vi.fn()
    render(<ProjectMenu onNewProject={onNewProject} onOpenFolder={vi.fn()} />)

    const trigger = screen.getByRole('button', { name: /project menu/i })
    expect(trigger).toHaveClass('ds-icon-button')
    expect(trigger).not.toHaveClass('project-menu__trigger')
    expect(trigger).toHaveAttribute('aria-haspopup')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu')).toBeInTheDocument()

    const item = screen.getByRole('menuitem', { name: /new project/i })
    expect(item).toHaveClass('ds-button')
    expect(item).not.toHaveClass('project-menu__item')

    await user.click(item)
    expect(onNewProject).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('opens the menu and calls Open file from its item', async () => {
    const user = userEvent.setup()
    const onOpenFile = vi.fn()
    render(<ProjectMenu onNewProject={vi.fn()} onOpenFile={onOpenFile} />)
    await user.click(screen.getByRole('button', { name: /project menu/i }))
    await user.click(screen.getByRole('menuitem', { name: /open file/i }))
    expect(onOpenFile).toHaveBeenCalledOnce()
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
