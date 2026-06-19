import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SceneProxyOverlay } from './scene-proxy-overlay'

afterEach(cleanup)

const proxies = [
  { id: 'wall:w1', label: 'Wall 1', x: 10, y: 20 },
  { id: 'room:r1', label: 'Room 1', x: 30, y: 40 },
]

describe('SceneProxyOverlay', () => {
  it('renders an option per entity with its label and selected state', () => {
    render(
      <SceneProxyOverlay proxies={proxies} selectedIds={new Set(['room:r1'])} onSelect={vi.fn()} />,
    )

    expect(screen.getByRole('listbox', { name: /3d entities/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Wall 1' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('option', { name: 'Room 1' })).toHaveAttribute('aria-selected', 'true')
  })

  it('keeps exactly one option in the tab order', () => {
    render(<SceneProxyOverlay proxies={proxies} selectedIds={new Set()} onSelect={vi.fn()} />)

    const inTabOrder = screen
      .getAllByRole('option')
      .filter((option) => option.getAttribute('tabindex') === '0')
    expect(inTabOrder).toHaveLength(1)
  })

  it('selects an entity when Enter is pressed on its option', () => {
    const onSelect = vi.fn()
    render(<SceneProxyOverlay proxies={proxies} selectedIds={new Set()} onSelect={onSelect} />)

    fireEvent.keyDown(screen.getByRole('option', { name: 'Wall 1' }), { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledWith('wall:w1', false)
  })

  it('announces the current selection in a live region', () => {
    render(
      <SceneProxyOverlay proxies={proxies} selectedIds={new Set(['room:r1'])} onSelect={vi.fn()} />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(/Room 1/)
  })

  it('renders no listbox when there are no entities', () => {
    const { container } = render(
      <SceneProxyOverlay proxies={[]} selectedIds={new Set()} onSelect={vi.fn()} />,
    )

    expect(container.querySelector('[role="listbox"]')).toBeNull()
  })

  it('keeps its options transparent to pointer events so the canvas keeps the pick', () => {
    render(<SceneProxyOverlay proxies={proxies} selectedIds={new Set()} onSelect={vi.fn()} />)

    expect(screen.getByRole('option', { name: 'Wall 1' })).toHaveStyle({ pointerEvents: 'none' })
  })

  it('exposes the proxy name accessibly without painting it over the 3d view', () => {
    render(<SceneProxyOverlay proxies={proxies} selectedIds={new Set()} onSelect={vi.fn()} />)

    const option = screen.getByRole('option', { name: 'Wall 1' })
    expect(option).toBeEmptyDOMElement()
  })
})
