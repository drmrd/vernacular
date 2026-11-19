import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DEFAULT_METRIC_PREFERENCES, type SceneGraph, type WallSceneNode } from '../../core'
import { createSelectionStore } from '../../bridge'
import { OpeningToolProvider, useOpeningTool } from './opening-tool-context'
import { PlanOverlay } from './plan-overlay'
import type { Viewport } from './viewport'

const WALL_ID = 'wall:w1'
const WALL_THICKNESS_MM = 114
const OVERLAP_SENTENCE = 'That would overlap an opening already in this wall'

const VIEWPORT: Viewport = { scale: 1, offset: { x: 0, y: 0 } }
const NOTHING_SELECTED: ReadonlySet<string> = new Set()
const WALL_SELECTED: ReadonlySet<string> = new Set([WALL_ID])

const WALL: WallSceneNode = {
  id: WALL_ID,
  kind: 'wall',
  floorId: 'g',
  start: { x: 0, y: 0 },
  end: { x: 100, y: 0 },
  thickness: WALL_THICKNESS_MM,
}

const GRAPH: SceneGraph = {
  nodes: [],
  walls: [WALL],
  rooms: [],
  underlays: [],
  openings: [],
  dimensions: [],
  stairs: [],
  furniture: [],
}

let attemptsSoFar = -1

// Stands in for the placement glue: one button reports the refusal, another clears it.
function Controls() {
  const { setPlacementRefusal, refusalAttempt } = useOpeningTool()
  attemptsSoFar = refusalAttempt
  return (
    <>
      <button type="button" onClick={() => setPlacementRefusal('opening-overlap')}>
        report overlap
      </button>
      <button type="button" onClick={() => setPlacementRefusal(null)}>
        clear refusal
      </button>
    </>
  )
}

function overlayTree(selectedIds: ReadonlySet<string>) {
  return (
    <OpeningToolProvider>
      <PlanOverlay
        viewport={VIEWPORT}
        graph={GRAPH}
        selectedIds={selectedIds}
        selection={createSelectionStore()}
        preferences={DEFAULT_METRIC_PREFERENCES}
        snap={null}
        tool="place-opening"
        layer="all"
      />
      <Controls />
    </OpeningToolProvider>
  )
}

// The text of the live region is carried by one element inside the status region. The
// contract leaves no selector for it, so a test finds it as the first element child. While
// the region still holds a bare string, the region itself is the node that carries it.
function carrier(): Element {
  const region = screen.getByRole('status')
  return region.firstElementChild ?? region
}

afterEach(cleanup)

// A screen reader speaks a live region when its content changes. The same sentence
// written into the same node changes nothing, so a repeated refusal would be silent
// unless the sentence arrives in a new element.
describe('PlanOverlay live region carrier', () => {
  it('replaces the element that carries a refusal when the same reason is reported again', async () => {
    const user = userEvent.setup()
    const { container } = render(overlayTree(NOTHING_SELECTED))

    await user.click(screen.getByRole('button', { name: 'report overlap' }))
    const first = carrier()
    await user.click(screen.getByRole('button', { name: 'report overlap' }))

    expect(carrier()).not.toBe(first)
    expect(carrier()).toHaveTextContent(OVERLAP_SENTENCE)
    expect(container.querySelector('.plan-overlay__refusal')).toHaveTextContent(OVERLAP_SENTENCE)
  })

  it('keeps the carrier when only the selection text changes', () => {
    const { rerender } = render(overlayTree(NOTHING_SELECTED))
    const before = carrier()
    const attemptsBefore = attemptsSoFar

    rerender(overlayTree(WALL_SELECTED))

    expect(carrier()).toBe(before)
    expect(carrier()).toHaveTextContent(/^Selected Wall,/)
    expect(attemptsSoFar).toBe(attemptsBefore)
  })

  it('reads the selection again once the refusal is cleared', async () => {
    const user = userEvent.setup()
    const { container } = render(overlayTree(WALL_SELECTED))
    await user.click(screen.getByRole('button', { name: 'report overlap' }))
    expect(screen.getByRole('status')).toHaveTextContent(OVERLAP_SENTENCE)

    await user.click(screen.getByRole('button', { name: 'clear refusal' }))

    expect(container.querySelector('.plan-overlay__refusal')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent(/^Selected Wall,/)
  })
})
