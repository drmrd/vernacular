import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { surfaceKey } from '../../core'
import type { SurfaceRef } from '../../core'
import { createSurfaceSelectionStore } from '../selection/surface-selection-store'
import { SurfaceSelectionProvider } from './surface-selection-provider'
import {
  useSurfaceSelection,
  useActiveSurface,
  useHighlightedSurface,
} from './surface-selection-context'

afterEach(cleanup)

const wallFaceLeft: SurfaceRef = { kind: 'wall-face', wallId: 'wall-1', side: 'left' }

function SurfaceReadout() {
  const selection = useSurfaceSelection()
  const active = useActiveSurface()
  return (
    <button type="button" onClick={() => selection.select(wallFaceLeft)}>
      {active === null ? 'none' : surfaceKey(active)}
    </button>
  )
}

function HighlightReadout() {
  const highlighted = useHighlightedSurface()
  return <span>{highlighted === null ? 'none' : surfaceKey(highlighted)}</span>
}

describe('SurfaceSelectionProvider', () => {
  it('shares a surface-selection store and re-renders consumers on change', () => {
    const store = createSurfaceSelectionStore()
    render(
      <SurfaceSelectionProvider store={store}>
        <SurfaceReadout />
      </SurfaceSelectionProvider>,
    )

    expect(screen.getByRole('button')).toHaveTextContent('none')
    act(() => {
      store.select(wallFaceLeft)
    })
    expect(screen.getByRole('button')).toHaveTextContent(surfaceKey(wallFaceLeft))
  })

  it('exposes the highlighted surface to consumers and re-renders them on change', () => {
    const store = createSurfaceSelectionStore()
    render(
      <SurfaceSelectionProvider store={store}>
        <HighlightReadout />
      </SurfaceSelectionProvider>,
    )

    expect(screen.getByText('none')).toBeInTheDocument()
    act(() => {
      store.highlight(wallFaceLeft)
    })
    expect(screen.getByText(surfaceKey(wallFaceLeft))).toBeInTheDocument()
  })

  it('throws when useSurfaceSelection is used outside a provider', () => {
    function Orphan() {
      useSurfaceSelection()
      return null
    }
    expect(() => render(<Orphan />)).toThrow(/SurfaceSelectionProvider/)
  })
})
