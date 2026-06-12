import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { createSnapPreferencesStore } from './snap-preferences-store'
import { SnapPreferencesProvider } from './snap-preferences-provider'
import { TOGGLABLE_SNAP_KINDS } from './snap-preferences'
import { SnapPanel } from './snap-panel'

afterEach(cleanup)

function fakeStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const map = new Map<string, string>()
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) }
}

function renderPanel() {
  const store = createSnapPreferencesStore({ storage: fakeStorage() })
  render(
    <SnapPreferencesProvider store={store}>
      <SnapPanel />
    </SnapPreferencesProvider>,
  )
  return store
}

describe('SnapPanel', () => {
  it('shows the master toggle and a checkbox for each running kind', () => {
    renderPanel()
    expect(screen.getByRole('checkbox', { name: 'Snapping' })).toBeChecked()
    expect(screen.getAllByRole('checkbox')).toHaveLength(TOGGLABLE_SNAP_KINDS.length + 1)
  })

  it('toggles a kind when its checkbox is clicked', () => {
    const store = renderPanel()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Grid' }))
    expect(store.getPreferences().kinds.grid).toBe(false)
  })

  it('turns snapping off when the master toggle is cleared', () => {
    const store = renderPanel()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Snapping' }))
    expect(store.getPreferences().enabled).toBe(false)
  })

  it('updates the catch radius from the number input', () => {
    const store = renderPanel()
    fireEvent.change(screen.getByLabelText('Catch radius'), { target: { value: '20' } })
    expect(store.getPreferences().pixelRadius).toBe(20)
  })
})
