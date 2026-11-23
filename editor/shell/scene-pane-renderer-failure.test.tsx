import { describe, it, expect, afterEach, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import type { SceneGraph } from '../../core'
import { SceneFailureHost } from '../../bridge/react/scene-failure-host'
import { ScenePane } from './scene-pane'
import {
  LOAD_ANNOUNCEMENT,
  START_ANNOUNCEMENT,
  TITLE_FOR_KIND,
} from './scene-failure-text-test-support'

const emptyGraph: SceneGraph = {
  nodes: [],
  walls: [],
  rooms: [],
  underlays: [],
  openings: [],
  dimensions: [],
  stairs: [],
  furniture: [],
}

const graphWithGeometry: SceneGraph = {
  ...emptyGraph,
  walls: [
    {
      id: 'wall:w1',
      kind: 'wall',
      floorId: 'g',
      start: { x: 0, y: 0 },
      end: { x: 1000, y: 0 },
      thickness: 100,
    },
  ],
}

// Each case states the active floor and whether the canvas wrapper shows a failure view.
let mockSceneGraph: SceneGraph = graphWithGeometry
let mockFailureKind: 'load' | 'start' | null = null

// The stand-in canvas never reports a first frame (data-harness-ready stays "false"), as a
// canvas whose renderer failed never does. When a failure kind is set, it renders the real
// failure host, as the real wrapper does in place of the 3D view.
vi.mock('../../bridge', () => ({
  // A component export legitimately keeps its PascalCase name in the mock.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  SceneCanvas: () => (
    <div data-testid="live-scene-canvas" data-harness-ready="false">
      {mockFailureKind === null ? null : (
        <SceneFailureHost kind={mockFailureKind} onReload={vi.fn()} />
      )}
    </div>
  ),
  useSceneGraph: () => mockSceneGraph,
  useActiveFloorId: () => 'g',
  detectRenderBackend: () => 'webgpu',
}))

afterEach(() => {
  mockSceneGraph = graphWithGeometry
  mockFailureKind = null
})

describe.each(['load', 'start'] as const)('ScenePane over a renderer that failed to %s', (kind) => {
  it('drops the loading overlay while the failure view is in the pane', async () => {
    mockFailureKind = kind

    render(<ScenePane />)

    await waitFor(() => {
      expect(screen.queryByText('Building the scene...')).toBeNull()
    })
  })

  it('drops the empty-floor guidance too, and keeps the failure view visible', async () => {
    mockFailureKind = kind
    mockSceneGraph = emptyGraph

    render(<ScenePane />)

    await waitFor(() => {
      expect(screen.queryByText('Building the scene...')).toBeNull()
    })
    expect(screen.queryByText('Nothing to show in 3D yet')).toBeNull()
    expect(screen.getByRole('heading', { name: TITLE_FOR_KIND[kind] })).toBeInTheDocument()
  })

  it('shows the styled view in the slot, not the plain one', async () => {
    mockFailureKind = kind

    render(<ScenePane />)

    expect(await screen.findByRole('heading', { name: TITLE_FOR_KIND[kind] })).toBeInTheDocument()
  })
})

describe('ScenePane over a renderer that failed to load', () => {
  it('shows the Reload page button of the design system', async () => {
    mockFailureKind = 'load'

    render(<ScenePane />)

    expect(await screen.findByRole('button', { name: 'Reload page' })).toHaveClass('ds-button')
  })
})

describe('ScenePane over a renderer that has not failed', () => {
  it('still shows the loading overlay until the scene is ready', () => {
    render(<ScenePane />)

    expect(screen.getByText('Building the scene...')).toBeInTheDocument()
  })
})

function announcerRegions(container: HTMLElement) {
  const announcer = container.querySelector<HTMLElement>('.scene-pane__announcer')
  if (announcer === null) throw new Error('the pane has no announcer')
  return {
    alert: within(announcer).getByRole('alert'),
    status: within(announcer).getByRole('status'),
  }
}

describe('ScenePane failure announcement', () => {
  it('mounts an empty polite region and an empty assertive region before any failure', () => {
    const { container } = render(<ScenePane />)

    const { alert, status } = announcerRegions(container)

    expect(alert).toBeEmptyDOMElement()
    expect(status).toBeEmptyDOMElement()
  })

  it('writes the could-not-load text into the assertive region that was there before the failure', async () => {
    const { container, rerender } = render(<ScenePane />)
    const { alert } = announcerRegions(container)

    mockFailureKind = 'load'
    rerender(<ScenePane />)

    await waitFor(() => {
      expect(alert).toHaveTextContent(LOAD_ANNOUNCEMENT)
    })
    const after = announcerRegions(container)
    expect(after.alert).toBe(alert)
    expect(after.status).toBeEmptyDOMElement()
  })

  it('writes the cannot-render text into the polite region that was there before the failure', async () => {
    const { container, rerender } = render(<ScenePane />)
    const { status } = announcerRegions(container)

    mockFailureKind = 'start'
    rerender(<ScenePane />)

    await waitFor(() => {
      expect(status).toHaveTextContent(START_ANNOUNCEMENT)
    })
    const after = announcerRegions(container)
    expect(after.status).toBe(status)
    expect(after.alert).toBeEmptyDOMElement()
  })

  it('leaves focus where it was when the failure is announced', async () => {
    const tree = () => (
      <>
        <button type="button">outside</button>
        <ScenePane />
      </>
    )
    const { rerender } = render(tree())
    const outside = screen.getByRole('button', { name: 'outside' })
    outside.focus()

    mockFailureKind = 'load'
    rerender(tree())

    await screen.findByRole('heading', { name: TITLE_FOR_KIND.load })
    await act(async () => {})
    expect(document.activeElement).toBe(outside)
  })

  it('empties both regions when the failure view goes away', async () => {
    const { container, rerender } = render(<ScenePane />)
    mockFailureKind = 'load'
    rerender(<ScenePane />)
    await waitFor(() => {
      expect(announcerRegions(container).alert).toHaveTextContent(LOAD_ANNOUNCEMENT)
    })

    mockFailureKind = null
    rerender(<ScenePane />)

    await waitFor(() => {
      expect(announcerRegions(container).alert).toBeEmptyDOMElement()
    })
    expect(announcerRegions(container).status).toBeEmptyDOMElement()
  })
})
