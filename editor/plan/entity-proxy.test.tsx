import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EntityProxy } from './entity-proxy'
import type { OverlayEntity } from './overlay-entities'
import type { ScreenPoint } from './viewport'

// A deterministic overlay entity. Tests vary only `selected` via the override
// so the accessible name, id, and kind stay fixed across assertions.
const ENTITY_ID = 'wall-1'
const ENTITY_LABEL = 'Wall, 3000 mm'

function makeEntity(overrides: Partial<OverlayEntity> = {}): OverlayEntity {
  return {
    id: ENTITY_ID,
    kind: 'wall',
    label: ENTITY_LABEL,
    anchor: { x: 0, y: 0 },
    selected: false,
    ...overrides,
  }
}

// The parent has already projected the anchor to screen pixels, so the proxy
// positions itself at exactly these coordinates.
const SCREEN: ScreenPoint = { x: 10, y: 20 }

function renderProxy(
  overrides: {
    entity?: OverlayEntity
    screen?: ScreenPoint
    tabIndex?: 0 | -1
    onSelect?: (id: string, additive: boolean) => void
  } = {},
) {
  const onSelect = overrides.onSelect ?? vi.fn()
  render(
    <EntityProxy
      entity={overrides.entity ?? makeEntity()}
      screen={overrides.screen ?? SCREEN}
      tabIndex={overrides.tabIndex ?? 0}
      onSelect={onSelect}
    />,
  )
  return { onSelect }
}

afterEach(cleanup)

describe('EntityProxy', () => {
  it('renders as an option whose accessible name is the entity label', () => {
    renderProxy()

    expect(screen.getByRole('option', { name: ENTITY_LABEL })).toBeInTheDocument()
  })

  it('marks the option selected when the entity is selected', () => {
    renderProxy({ entity: makeEntity({ selected: true }) })

    expect(screen.getByRole('option', { name: ENTITY_LABEL })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('marks the option not selected when the entity is not selected', () => {
    renderProxy({ entity: makeEntity({ selected: false }) })

    expect(screen.getByRole('option', { name: ENTITY_LABEL })).toHaveAttribute(
      'aria-selected',
      'false',
    )
  })

  it('is focusable when the roving tabindex is 0', () => {
    renderProxy({ tabIndex: 0 })

    expect(screen.getByRole('option', { name: ENTITY_LABEL })).toHaveAttribute('tabindex', '0')
  })

  it('is removed from the tab order when the roving tabindex is -1', () => {
    renderProxy({ tabIndex: -1 })

    expect(screen.getByRole('option', { name: ENTITY_LABEL })).toHaveAttribute('tabindex', '-1')
  })

  it('absolutely positions itself at the projected screen point', () => {
    renderProxy({ screen: SCREEN })

    const option = screen.getByRole('option', { name: ENTITY_LABEL })
    expect(option.style.position).toBe('absolute')
    expect(option.style.left).toBe('10px')
    expect(option.style.top).toBe('20px')
  })

  it('selects non-additively when Enter is pressed while focused', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderProxy()

    const option = screen.getByRole('option', { name: ENTITY_LABEL })
    option.focus()
    await user.keyboard('{Enter}')

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(ENTITY_ID, false)
  })

  it('selects non-additively when Space is pressed while focused', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderProxy()

    const option = screen.getByRole('option', { name: ENTITY_LABEL })
    option.focus()
    await user.keyboard('{ }')

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(ENTITY_ID, false)
  })

  it('selects additively when Shift is held while pressing Enter', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderProxy()

    const option = screen.getByRole('option', { name: ENTITY_LABEL })
    option.focus()
    await user.keyboard('{Shift>}{Enter}{/Shift}')

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(ENTITY_ID, true)
  })

  it('ignores keys unrelated to selection', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderProxy()

    const option = screen.getByRole('option', { name: ENTITY_LABEL })
    option.focus()
    await user.keyboard('{ArrowDown}')
    await user.keyboard('a')

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('does not select on a pointer click (pointer selection lives on the Canvas)', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderProxy()

    const option = screen.getByRole('option', { name: ENTITY_LABEL })
    await user.click(option)

    expect(onSelect).not.toHaveBeenCalled()
  })
})
