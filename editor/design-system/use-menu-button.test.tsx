import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useMenuButton } from './use-menu-button'

afterEach(cleanup)

function MenuHarness() {
  const menu = useMenuButton<HTMLDivElement>()
  return (
    <div ref={menu.containerRef}>
      <button {...menu.triggerProps}>Project</button>
      {menu.open ? (
        <ul {...menu.menuProps}>
          <li role="none">
            <button role="menuitem">New</button>
          </li>
          <li role="none">
            <button role="menuitem">Open</button>
          </li>
          <li role="none">
            <button role="menuitem">Save</button>
          </li>
        </ul>
      ) : null}
    </div>
  )
}

describe('useMenuButton', () => {
  it('starts closed, opens on the first trigger click, and closes again on the next', async () => {
    const user = userEvent.setup()
    render(<MenuHarness />)

    const trigger = screen.getByRole('button', { name: 'Project' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).toBeNull()

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('moves focus to the first menu item when the menu opens', async () => {
    const user = userEvent.setup()
    render(<MenuHarness />)

    const trigger = screen.getByRole('button', { name: 'Project' })
    await user.click(trigger)

    const items = screen.getAllByRole('menuitem')
    expect(items[0]).toHaveTextContent('New')
    expect(items[0]).toHaveFocus()
  })

  it('roves focus with the arrow keys, wrapping past the last item and before the first', async () => {
    const user = userEvent.setup()
    render(<MenuHarness />)

    const trigger = screen.getByRole('button', { name: 'Project' })
    await user.click(trigger)

    const items = screen.getAllByRole('menuitem')
    expect(items[0]).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(items[1]).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(items[2]).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(items[0]).toHaveFocus()

    await user.keyboard('{ArrowUp}')
    expect(items[2]).toHaveFocus()
  })

  it('closes the menu and returns focus to the trigger when Escape is pressed', async () => {
    const user = userEvent.setup()
    render(<MenuHarness />)

    const trigger = screen.getByRole('button', { name: 'Project' })
    await user.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })
})
