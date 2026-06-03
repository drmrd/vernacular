import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { createSelectionStore } from '../selection/selection-store'
import { SelectionProvider } from './selection-provider'
import { useSelection, useSelectionIds } from './selection-context'

afterEach(cleanup)

function SelectionReadout() {
  const selection = useSelection()
  const ids = useSelectionIds()
  return (
    <button type="button" onClick={() => selection.select('wall:a')}>
      {ids.size === 0 ? 'none' : [...ids].join(',')}
    </button>
  )
}

describe('SelectionProvider', () => {
  it('shares a selection store and re-renders consumers on change', () => {
    const store = createSelectionStore()
    render(
      <SelectionProvider store={store}>
        <SelectionReadout />
      </SelectionProvider>,
    )

    expect(screen.getByRole('button')).toHaveTextContent('none')
    act(() => {
      store.select('wall:a')
    })
    expect(screen.getByRole('button')).toHaveTextContent('wall:a')
  })

  it('throws when useSelection is used outside a provider', () => {
    function Orphan() {
      useSelection()
      return null
    }
    expect(() => render(<Orphan />)).toThrow(/SelectionProvider/)
  })
})
