import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { PerspectiveCamera, Raycaster } from '../../engine/testing'
import { buildScene } from '../../engine'
import { commitSelectionAt } from '../../bridge/react/scene-selection'
import {
  ActiveFloorProvider,
  EditorSessionProvider,
  SelectionProvider,
  createActiveFloorStore,
  createEditorSession,
  createPerceivedColorStore,
  createSelectionStore,
  useSurfaceSelection,
  type SurfaceSelectionStore,
} from '../../bridge'
import {
  createEmptyProject,
  createFloor,
  planToWorld,
  type Point,
  type SceneGraph,
  type SurfaceRef,
  type WallSceneNode,
} from '../../core'
import { ThemeProvider } from '../../editor/design-system'
import { NotificationProvider } from '../../editor/design-system/notifications/use-notifications'
import { ActiveToolProvider } from '../../editor/tools/active-tool-provider'
import { EditLayerProvider } from '../../editor/tools/edit-layer-provider'
import { ShellProviders } from '../../editor/shell/shell-providers'

afterEach(cleanup)

// A 3D click on one face of a wall, through the real selection handler, into the shell's
// providers. The wall runs along the plan x axis, so its left face is the one at plan +y
// and its right face the one at plan -y. The click is the centre of the canvas, so the
// camera's aim point is exactly where the ray strikes.

const FLOOR_ID = 'g'
const WALL_ID = 'w1'
const WALL_NODE_ID = `wall:${WALL_ID}`
const WALL_HEIGHT = 2600
const WALL_LENGTH = 4000
const AIM_ALONG = 2000
const AIM_HEIGHT = 1300
const STANDOFF = 2000
const CANVAS_SIZE = 200
const CANVAS_CENTER = CANVAS_SIZE / 2

const wall: WallSceneNode = {
  id: WALL_NODE_ID,
  kind: 'wall',
  floorId: FLOOR_ID,
  start: { x: 0, y: 0 },
  end: { x: WALL_LENGTH, y: 0 },
  thickness: 120,
  height: WALL_HEIGHT,
}

const graph: SceneGraph = {
  nodes: [{ id: `floor:${FLOOR_ID}`, kind: 'floor', name: 'G', elevation: 0 }],
  walls: [wall],
  rooms: [],
  underlays: [],
  openings: [],
  dimensions: [],
  stairs: [],
  furniture: [],
}

const faceRef = (side: 'left' | 'right'): SurfaceRef => ({
  kind: 'wall-face',
  wallId: WALL_ID,
  side,
})

const cameraLooking = (from: Point, at: Point): PerspectiveCamera => {
  const eye = planToWorld(from, AIM_HEIGHT)
  const target = planToWorld(at, AIM_HEIGHT)
  const camera = new PerspectiveCamera(50, 1, 1, 100000)
  camera.position.set(eye.x, eye.y, eye.z)
  camera.lookAt(target.x, target.y, target.z)
  camera.updateMatrixWorld(true)
  return camera
}

/** A camera standing off the wall's given side, aimed square at solid wall. */
const faceOnCamera = (side: 'left' | 'right'): PerspectiveCamera =>
  cameraLooking({ x: AIM_ALONG, y: side === 'left' ? STANDOFF : -STANDOFF }, { x: AIM_ALONG, y: 0 })

const stubCanvas = (): HTMLCanvasElement =>
  ({
    getBoundingClientRect: () => ({ left: 0, top: 0, width: CANVAS_SIZE, height: CANVAS_SIZE }),
  }) as unknown as HTMLCanvasElement

const centreClick = (): PointerEvent =>
  ({
    clientX: CANVAS_CENTER,
    clientY: CANVAS_CENTER,
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
  }) as unknown as PointerEvent

/** Hands the shell's own surface selection store to the test. */
function SurfaceSelectionProbe({ onStore }: { onStore: (store: SurfaceSelectionStore) => void }) {
  onStore(useSurfaceSelection())
  return null
}

function mountShell() {
  const project = createEmptyProject({
    name: 'Test',
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0',
  })
  project.floors = [createFloor('Ground', { id: FLOOR_ID })]
  const selection = createSelectionStore()
  let surfaceSelection: SurfaceSelectionStore | undefined
  render(
    <NotificationProvider>
      <ThemeProvider>
        <EditorSessionProvider session={createEditorSession(project)}>
          <SelectionProvider store={selection}>
            <ActiveFloorProvider store={createActiveFloorStore(FLOOR_ID)}>
              <ActiveToolProvider>
                <EditLayerProvider>
                  <ShellProviders>
                    <SurfaceSelectionProbe onStore={(store) => (surfaceSelection = store)} />
                  </ShellProviders>
                </EditLayerProvider>
              </ActiveToolProvider>
            </ActiveFloorProvider>
          </SelectionProvider>
        </EditorSessionProvider>
      </ThemeProvider>
    </NotificationProvider>,
  )
  return { selection, surfaceSelection: surfaceSelection as SurfaceSelectionStore }
}

function clickInShell(camera: PerspectiveCamera) {
  const shell = mountShell()
  const root = buildScene(graph)
  root.updateMatrixWorld(true)
  act(() =>
    commitSelectionAt(centreClick(), {
      domElement: stubCanvas(),
      camera,
      raycaster: new Raycaster(),
      root,
      selection: shell.selection,
      surfaceSelection: shell.surfaceSelection,
      perceivedColor: createPerceivedColorStore(),
    }),
  )
  return shell
}

describe('a 3D click on a wall face in the shell', () => {
  it.each(['left', 'right'] as const)(
    'selects the wall and leaves the %s face that the click picked as the paint target',
    (side) => {
      const { selection, surfaceSelection } = clickInShell(faceOnCamera(side))

      expect(selection.getSelectedIds()).toEqual(new Set([WALL_NODE_ID]))
      expect(surfaceSelection.getActiveSurface()).toEqual(faceRef(side))
    },
  )
})
