import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { LibraryItem } from '../../storage'
import { FURNITURE_ROTATION_STEP_DEGREES } from './place-furniture'
import { FurniturePlacementProvider, useFurniturePlacement } from './furniture-placement-context'

afterEach(cleanup)

const chair: LibraryItem = {
  reference: { scope: 'user', contentHash: 'hash-1' },
  name: 'Chair',
  kind: 'furniture',
  categories: [],
  eras: [],
  footprint: { width: 600, depth: 600 },
  height: 750,
}

function Probe() {
  const { armed, rotation, armItem, disarm, rotateArmed } = useFurniturePlacement()
  return (
    <div>
      <span data-testid="armed">{armed?.name ?? 'none'}</span>
      <span data-testid="rotation">{rotation}</span>
      <button type="button" onClick={() => armItem(chair)}>
        Arm
      </button>
      <button type="button" onClick={() => rotateArmed()}>
        Rotate
      </button>
      <button type="button" onClick={() => disarm()}>
        Disarm
      </button>
    </div>
  )
}

describe('furniture-placement-context', () => {
  it('arms nothing and applies no rotation by default', () => {
    render(
      <FurniturePlacementProvider>
        <Probe />
      </FurniturePlacementProvider>,
    )

    expect(screen.getByTestId('armed')).toHaveTextContent('none')
    expect(screen.getByTestId('rotation')).toHaveTextContent('0')
  })

  it('arms the picked item with a fresh rotation', async () => {
    const user = userEvent.setup()
    render(
      <FurniturePlacementProvider>
        <Probe />
      </FurniturePlacementProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Arm' }))

    expect(screen.getByTestId('armed')).toHaveTextContent('Chair')
    expect(screen.getByTestId('rotation')).toHaveTextContent('0')
  })

  it('advances the ghost rotation by one coarse step each rotate', async () => {
    const user = userEvent.setup()
    render(
      <FurniturePlacementProvider>
        <Probe />
      </FurniturePlacementProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Arm' }))
    await user.click(screen.getByRole('button', { name: 'Rotate' }))

    expect(screen.getByTestId('rotation')).toHaveTextContent(
      String(FURNITURE_ROTATION_STEP_DEGREES),
    )

    await user.click(screen.getByRole('button', { name: 'Rotate' }))

    expect(screen.getByTestId('rotation')).toHaveTextContent(
      String(2 * FURNITURE_ROTATION_STEP_DEGREES),
    )
  })

  it('clears the armed item on disarm', async () => {
    const user = userEvent.setup()
    render(
      <FurniturePlacementProvider>
        <Probe />
      </FurniturePlacementProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Arm' }))
    await user.click(screen.getByRole('button', { name: 'Disarm' }))

    expect(screen.getByTestId('armed')).toHaveTextContent('none')
  })

  it('falls back to an unarmed value outside a provider rather than throwing', () => {
    expect(() => render(<Probe />)).not.toThrow()
    expect(screen.getByTestId('armed')).toHaveTextContent('none')
  })
})
