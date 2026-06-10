import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { createActiveFloorStore } from '../active-floor/active-floor-store'
import { ActiveFloorProvider } from './active-floor-provider'
import { useActiveFloorId, useSetActiveFloorId } from './active-floor-context'

afterEach(cleanup)

function Probe() {
  const id = useActiveFloorId()
  const setActiveFloorId = useSetActiveFloorId()
  return (
    <button type="button" onClick={() => setActiveFloorId('f2')}>
      {id ?? 'none'}
    </button>
  )
}

describe('ActiveFloorProvider', () => {
  it('exposes the active floor id and a setter to descendants', () => {
    const store = createActiveFloorStore('f1')
    render(
      <ActiveFloorProvider store={store}>
        <Probe />
      </ActiveFloorProvider>,
    )

    expect(screen.getByRole('button')).toHaveTextContent('f1')
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button')).toHaveTextContent('f2')
  })
})
