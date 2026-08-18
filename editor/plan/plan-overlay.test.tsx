import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DEFAULT_METRIC_PREFERENCES,
  type DimensionSceneNode,
  type OpeningSceneNode,
  type Point,
  type RoomSceneNode,
  type SceneGraph,
  type WallSceneNode,
} from '../../core'
import { createSelectionStore } from '../../bridge'
import { OpeningToolProvider, useOpeningTool } from './opening-tool-context'
import type { PlacementRefusal } from './overlay-announce'
import { PlanOverlay, type PlanOverlayProps } from './plan-overlay'
import type { Viewport } from './viewport'

const FLOOR_ID = 'g'
const WALL_THICKNESS_MM = 114
const OPENING_WIDTH_MM = 900
const OPENING_HEIGHT_MM = 2040
const ROOM_AREA_MM2 = 1_200

const VIEWPORT: Viewport = { scale: 1, offset: { x: 0, y: 0 } }
const EMPTY_SELECTION: ReadonlySet<string> = new Set()

const ROOM_POLYGON: Point[] = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 30 },
  { x: 0, y: 30 },
]

function wall(): WallSceneNode {
  return {
    id: 'wall:w1',
    kind: 'wall',
    floorId: FLOOR_ID,
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
    thickness: WALL_THICKNESS_MM,
  }
}

function room(): RoomSceneNode {
  return {
    id: 'room:r1',
    kind: 'room',
    floorId: FLOOR_ID,
    polygon: ROOM_POLYGON,
    clearPolygon: ROOM_POLYGON,
    area: ROOM_AREA_MM2,
  }
}

function opening(): OpeningSceneNode {
  return {
    id: 'opening:o1',
    kind: 'opening',
    floorId: FLOOR_ID,
    type: 'door.single',
    center: { x: 30, y: 0 },
    along: { x: 1, y: 0 },
    normal: { x: 0, y: 1 },
    width: OPENING_WIDTH_MM,
    height: OPENING_HEIGHT_MM,
    sillHeight: 0,
    hostThickness: WALL_THICKNESS_MM,
    orientation: { hinge: 'start', facing: 'positive' },
  }
}

function dimension(): DimensionSceneNode {
  return {
    id: 'dimension:d1',
    kind: 'dimension',
    floorId: FLOOR_ID,
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
    offset: 10,
    length: 100,
  }
}

function graphWithOneOfEach(): SceneGraph {
  return {
    nodes: [],
    walls: [wall()],
    rooms: [room()],
    underlays: [],
    openings: [opening()],
    dimensions: [dimension()],
    stairs: [],
    furniture: [],
  }
}

function renderOverlay(layer: PlanOverlayProps['layer']) {
  render(
    <PlanOverlay
      viewport={VIEWPORT}
      graph={graphWithOneOfEach()}
      selectedIds={EMPTY_SELECTION}
      selection={createSelectionStore()}
      preferences={DEFAULT_METRIC_PREFERENCES}
      snap={null}
      tool="select"
      layer={layer}
    />,
  )
}

afterEach(cleanup)

// The DOM accessibility overlay exposes one keyboard proxy (role="option") per
// selectable entity. The active edit layer must scope those proxies the same way
// it scopes pointer selection, so a keyboard user can only reach the entities the
// active layer leaves selectable.
describe('PlanOverlay edit-layer scoping', () => {
  it('exposes every entity proxy for the "all" layer', () => {
    renderOverlay('all')

    expect(screen.getAllByRole('option')).toHaveLength(4)
  })

  it('exposes only wall and room proxies for the "walls" layer', () => {
    renderOverlay('walls')

    expect(screen.getAllByRole('option')).toHaveLength(2)
    expect(screen.getByRole('option', { name: /^Wall,/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^Room,/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /^Dimension,/ })).not.toBeInTheDocument()
  })

  it('exposes only the opening proxy for the "openings" layer', () => {
    renderOverlay('openings')

    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.queryByRole('option', { name: /^Wall,/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /^Room,/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /^Dimension,/ })).not.toBeInTheDocument()
  })

  it('exposes only the dimension proxy for the "annotations" layer', () => {
    renderOverlay('annotations')

    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.getByRole('option', { name: /^Dimension,/ })).toBeInTheDocument()
  })
})

// The overlay's compass marks true north, so it must rotate to the project site's
// north bearing rather than always pointing up.
describe('PlanOverlay north arrow', () => {
  it('rotates the compass to the site north bearing', () => {
    render(
      <PlanOverlay
        viewport={VIEWPORT}
        graph={graphWithOneOfEach()}
        selectedIds={EMPTY_SELECTION}
        selection={createSelectionStore()}
        preferences={DEFAULT_METRIC_PREFERENCES}
        snap={null}
        tool="select"
        layer="all"
        northBearing={Math.PI / 2}
      />,
    )

    const compass = screen.getByRole('img', { name: /north/i })
    expect(compass.querySelector('g')?.getAttribute('transform')).toBe('rotate(-90 12 18)')
  })
})

// Stands in for the placement glue: the hooks report a refused click through the
// shared placement context, which is where the overlay reads it from.
function RefusalArm({ refusal }: { refusal: PlacementRefusal }) {
  const { setPlacementRefusal } = useOpeningTool()
  return (
    <button type="button" onClick={() => setPlacementRefusal(refusal)}>
      arm refusal
    </button>
  )
}

function overlayTree(tool: PlanOverlayProps['tool'], refusal: PlacementRefusal) {
  return (
    <OpeningToolProvider>
      <PlanOverlay
        viewport={VIEWPORT}
        graph={graphWithOneOfEach()}
        selectedIds={EMPTY_SELECTION}
        selection={createSelectionStore()}
        preferences={DEFAULT_METRIC_PREFERENCES}
        snap={null}
        tool={tool}
        layer="all"
      />
      <RefusalArm refusal={refusal} />
    </OpeningToolProvider>
  )
}

// Re-rendering the same tree with another tool keeps the provider mounted, so the
// refusal state survives the switch exactly as it does when the user picks another
// chip in the running editor.
function renderOverlayUnderTool(tool: PlanOverlayProps['tool'], refusal: PlacementRefusal) {
  const view = render(overlayTree(tool, refusal))
  return {
    ...view,
    takeUpTool: (next: PlanOverlayProps['tool']) => view.rerender(overlayTree(next, refusal)),
  }
}

async function armRefusal() {
  await userEvent.setup().click(screen.getByRole('button', { name: 'arm refusal' }))
}

// A pointer placement that puts nothing on the plan has to say why. A sighted user
// gets the reason on the canvas and a screen-reader user gets it from the live
// region, so the refusal is never silent on either path.
describe('PlanOverlay placement refusals', () => {
  it('shows the reason on the canvas', async () => {
    const { container } = renderOverlayUnderTool('place-opening', 'no-host-wall')

    await armRefusal()

    expect(container.querySelector('.plan-overlay__refusal')).toHaveTextContent(
      'No wall here to host the opening',
    )
  })

  it('announces the reason through the live region', async () => {
    renderOverlayUnderTool('place-stair', 'no-floor-above')

    await armRefusal()

    expect(screen.getByRole('status')).toHaveTextContent('Add a floor above to place stairs')
  })

  it('shows nothing until a placement is refused', () => {
    const { container } = renderOverlayUnderTool('place-opening', 'no-host-wall')

    expect(container.querySelector('.plan-overlay__refusal')).toBeNull()
  })

  it('shows nothing under a tool whose clicks are never refused', async () => {
    const { container } = renderOverlayUnderTool('select', 'no-host-wall')

    await armRefusal()

    expect(container.querySelector('.plan-overlay__refusal')).toBeNull()
  })

  it('keeps one tool’s refusal off the canvas under another placement tool', async () => {
    const { container, takeUpTool } = renderOverlayUnderTool('place-opening', 'no-host-wall')
    await armRefusal()

    takeUpTool('place-stair')

    expect(container.querySelector('.plan-overlay__refusal')).toBeNull()
    expect(screen.getByRole('status')).not.toHaveTextContent('No wall here to host the opening')
  })

  it('does not resurrect a refusal when its tool is taken up again', async () => {
    const { container, takeUpTool } = renderOverlayUnderTool('place-opening', 'no-host-wall')
    await armRefusal()

    takeUpTool('select')
    takeUpTool('place-opening')

    expect(container.querySelector('.plan-overlay__refusal')).toBeNull()
    expect(screen.getByRole('status')).not.toHaveTextContent('No wall here to host the opening')
  })
})
