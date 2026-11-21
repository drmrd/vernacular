import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProjectMenu } from './project-menu'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ProjectMenu', () => {
  it('renders nothing when no project handlers are provided', () => {
    const { container } = render(<ProjectMenu />)
    expect(container.firstChild).toBeNull()
  })

  it('opens the menu and calls New project from its item', async () => {
    const user = userEvent.setup()
    const onNewProject = vi.fn()
    render(<ProjectMenu onNewProject={onNewProject} onOpenFolder={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /project/i }))
    await user.click(screen.getByRole('menuitem', { name: /new project/i }))
    expect(onNewProject).toHaveBeenCalledTimes(1)
  })

  it('routes the trigger and items through the design-system primitives while preserving menu semantics', async () => {
    const user = userEvent.setup()
    const onNewProject = vi.fn()
    render(<ProjectMenu onNewProject={onNewProject} onOpenFolder={vi.fn()} />)

    const trigger = screen.getByRole('button', { name: /project/i })
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

  it('opens the menu and calls Save from its item', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<ProjectMenu onSave={onSave} onNewProject={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /project/i }))
    await user.click(screen.getByRole('menuitem', { name: /save/i }))
    expect(onSave).toHaveBeenCalledOnce()
  })

  it('opens the menu and calls Import file from its item', async () => {
    const user = userEvent.setup()
    const onImportFile = vi.fn()
    render(<ProjectMenu onNewProject={vi.fn()} onImportFile={onImportFile} />)
    await user.click(screen.getByRole('button', { name: /project/i }))
    await user.click(screen.getByRole('menuitem', { name: /import file/i }))
    expect(onImportFile).toHaveBeenCalledOnce()
  })

  it('opens the menu, calls Switch projects from its item, and closes the menu', async () => {
    const user = userEvent.setup()
    const onSwitchProjects = vi.fn()
    render(<ProjectMenu onNewProject={vi.fn()} onSwitchProjects={onSwitchProjects} />)
    await user.click(screen.getByRole('button', { name: /project/i }))
    await user.click(screen.getByRole('menuitem', { name: 'Switch projects' }))
    expect(onSwitchProjects).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
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
    await user.click(screen.getByRole('button', { name: /project/i }))
    await user.click(screen.getByRole('menuitem', { name: /eastmore farmstead/i }))
    expect(onOpenRecent).toHaveBeenCalledWith('p1')
  })

  it('two recent projects with one name are two rows, each opens its own id, and nothing is logged', async () => {
    const user = userEvent.setup()
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const onOpenRecent = vi.fn()
    const twins = [
      { id: 'twin-a', name: 'Untitled project' },
      { id: 'twin-b', name: 'Untitled project' },
    ]
    render(<ProjectMenu onOpenRecent={onOpenRecent} recentProjects={twins} />)
    const trigger = screen.getByRole('button', { name: /project/i })

    await user.click(trigger)
    const rows = screen.getAllByRole('menuitem', { name: 'Untitled project' })
    expect(rows).toHaveLength(twins.length)
    await user.click(rows[1] as HTMLElement)
    await user.click(trigger)
    await user.click(
      screen.getAllByRole('menuitem', { name: 'Untitled project' })[0] as HTMLElement,
    )

    expect(onOpenRecent.mock.calls).toEqual([['twin-b'], ['twin-a']])
    expect(logged).not.toHaveBeenCalled()
  })

  it('renders a visible "Project" label on the trigger beside the chevron', () => {
    render(<ProjectMenu onNewProject={vi.fn()} onOpenFolder={vi.fn()} />)

    const trigger = screen.getByRole('button', { name: /project/i })
    expect(trigger).toHaveTextContent('Project')
    expect(screen.getByText('Project')).toBeInTheDocument()
  })

  it('closes the open menu and returns focus to the trigger when Escape is pressed', async () => {
    const user = userEvent.setup()
    render(<ProjectMenu onNewProject={vi.fn()} onOpenFolder={vi.fn()} />)

    const trigger = screen.getByRole('button', { name: /project/i })
    await user.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveFocus()
  })
})

describe('ProjectMenu rename', () => {
  it('renames the project inline from the Rename item and reports the committed name', async () => {
    const user = userEvent.setup()
    const onRename = vi.fn()
    render(
      <ProjectMenu onNewProject={vi.fn()} projectName="Eastmore Farmstead" onRename={onRename} />,
    )

    await user.click(screen.getByRole('button', { name: /project/i }))
    await user.click(screen.getByRole('menuitem', { name: /^rename$/i }))

    const input = screen.getByRole('textbox', { name: /project name/i })
    expect(input).toHaveValue('Eastmore Farmstead')

    await user.clear(input)
    await user.type(input, 'Cedar Hollow{Enter}')

    expect(onRename).toHaveBeenCalledWith('Cedar Hollow')
  })
})

describe('ProjectMenu recent projects beside the actions', () => {
  it('a recent project named like an action row is a row of its own, opens its id, and nothing is logged', async () => {
    const user = userEvent.setup()
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const onNewProject = vi.fn()
    const onOpenRecent = vi.fn()
    render(
      <ProjectMenu
        onNewProject={onNewProject}
        onOpenRecent={onOpenRecent}
        recentProjects={[{ id: 'recent-1', name: 'New project' }]}
      />,
    )
    const trigger = screen.getByRole('button', { name: /project/i })

    await user.click(trigger)
    const rowCount = screen.getAllByRole('menuitem', { name: 'New project' }).length
    expect(rowCount).toBe(2)
    for (let index = 0; index < rowCount; index += 1) {
      if (index > 0) await user.click(trigger)
      await user.click(
        screen.getAllByRole('menuitem', { name: 'New project' })[index] as HTMLElement,
      )
    }

    expect(onOpenRecent.mock.calls).toEqual([['recent-1']])
    expect(onNewProject).toHaveBeenCalledOnce()
    expect(logged).not.toHaveBeenCalled()
  })
})

describe('ProjectMenu order of the items', () => {
  const itemNames = () => screen.getAllByRole('menuitem').map((item) => item.textContent)

  it('lists New project, Switch projects, Import file, Open folder, Save, Rename, then the recent projects', async () => {
    const user = userEvent.setup()
    render(
      <ProjectMenu
        onNewProject={vi.fn()}
        onSwitchProjects={vi.fn()}
        onImportFile={vi.fn()}
        onOpenFolder={vi.fn()}
        onSave={vi.fn()}
        onRename={vi.fn()}
        projectName="Eastmore Farmstead"
        onOpenRecent={vi.fn()}
        recentProjects={[
          { id: 'hubbard', name: 'Hubbard House' },
          { id: 'queen-anne', name: 'Queen Anne Cottage' },
        ]}
      />,
    )
    await user.click(screen.getByRole('button', { name: /project/i }))
    expect(itemNames()).toEqual([
      'New project',
      'Switch projects',
      'Import file',
      'Open folder',
      'Save',
      'Rename',
      'Hubbard House',
      'Queen Anne Cottage',
    ])
    expect(screen.queryByRole('menuitem', { name: /open file/i })).not.toBeInTheDocument()
  })

  it('leaves out an item that has no handler and keeps the order of the rest', async () => {
    const user = userEvent.setup()
    render(
      <ProjectMenu
        onNewProject={vi.fn()}
        onOpenFolder={vi.fn()}
        onSave={vi.fn()}
        onRename={vi.fn()}
        projectName="Eastmore Farmstead"
        onOpenRecent={vi.fn()}
        recentProjects={[{ id: 'hubbard', name: 'Hubbard House' }]}
      />,
    )
    await user.click(screen.getByRole('button', { name: /project/i }))
    expect(itemNames()).toEqual(['New project', 'Open folder', 'Save', 'Rename', 'Hubbard House'])
  })
})
