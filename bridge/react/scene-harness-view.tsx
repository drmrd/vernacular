import { Canvas, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo } from 'react'
import {
  DEFAULT_COLOR_TEMPERATURE_K,
  type Bounds3,
  type OpeningSceneNode,
  type Point,
  type RoomSceneNode,
  type SceneGraph,
  type SurfaceTreatment,
} from '../../core'
import { createSceneRenderer } from '../../engine'
import { fitCameraToBounds } from './fit-camera'
import { buildFramedScene } from './framed-scene'
import { SceneLighting } from './scene-lighting'

// Deterministic fixture canvas size, pinned so the committed baseline is pixel-stable
// across runs and machines. Kept small to keep the baseline PNG lightweight.
const HARNESS_WIDTH = 320
const HARNESS_HEIGHT = 240

// An opaque clear color so the rendered frame is a real, non-transparent render rather
// than a blank alpha=0 canvas.
const HARNESS_BACKGROUND = 0x1b2a3a

// A fixed four-wall room (a 4000 by 3000 mm rectangle, 120 mm walls, 2600 mm tall) so
// the harness renders the first lit wall shell rather than an empty scene. The ids and
// dimensions are fixed, so the framed camera and the rendered frame are deterministic.
const SHELL_THICKNESS = 120
const SHELL_HEIGHT = 2600
const SHELL_WIDTH_X = 4000
const SHELL_DEPTH_Z = 3000
// Half the 120 mm wall thickness: the clear floor area sits inset from the
// centerline rectangle by this much, meeting the inner faces of the walls.
const SHELL_CLEAR_INSET = 60

function shellWall(id: string, start: Point, end: Point) {
  return {
    id,
    kind: 'wall' as const,
    floorId: 'demo',
    start,
    end,
    thickness: SHELL_THICKNESS,
    height: SHELL_HEIGHT,
  }
}

// The single room the four walls enclose: its clear-area floor slab and ceiling
// render alongside the walls so the harness baseline covers the room shell.
const SHELL_ROOM: RoomSceneNode = {
  id: 'room:demo',
  kind: 'room',
  floorId: 'demo',
  polygon: [
    { x: 0, y: 0 },
    { x: SHELL_WIDTH_X, y: 0 },
    { x: SHELL_WIDTH_X, y: SHELL_DEPTH_Z },
    { x: 0, y: SHELL_DEPTH_Z },
  ],
  clearPolygon: [
    { x: SHELL_CLEAR_INSET, y: SHELL_CLEAR_INSET },
    { x: SHELL_WIDTH_X - SHELL_CLEAR_INSET, y: SHELL_CLEAR_INSET },
    { x: SHELL_WIDTH_X - SHELL_CLEAR_INSET, y: SHELL_DEPTH_Z - SHELL_CLEAR_INSET },
    { x: SHELL_CLEAR_INSET, y: SHELL_DEPTH_Z - SHELL_CLEAR_INSET },
  ],
  area: (SHELL_WIDTH_X - SHELL_THICKNESS) * (SHELL_DEPTH_Z - SHELL_THICKNESS),
  ceilingHeight: SHELL_HEIGHT,
}

// A single-swing door centered in the south wall, so the harness baseline shows a
// real void cut through a wall (head and jambs lined with reveals, open to the
// floor). `hostWallId` is the south wall's model id (the `wall:` prefix stripped).
const DOOR_WIDTH = 900
const DOOR_HEIGHT = 2032
const SHELL_DOOR: OpeningSceneNode = {
  id: 'opening:south-door',
  kind: 'opening',
  floorId: 'demo',
  type: 'single-swing-door',
  hostWallId: 'south',
  center: { x: SHELL_WIDTH_X / 2, y: 0 },
  along: { x: 1, y: 0 },
  normal: { x: 0, y: 1 },
  width: DOOR_WIDTH,
  height: DOOR_HEIGHT,
  sillHeight: 0,
  hostThickness: SHELL_THICKNESS,
  orientation: { hinge: 'start', facing: 'positive' },
}

const SHELL_FIXTURE: SceneGraph = {
  nodes: [{ id: 'floor:demo', kind: 'floor', name: 'Demo', elevation: 0 }],
  walls: [
    shellWall('wall:south', { x: 0, y: 0 }, { x: SHELL_WIDTH_X, y: 0 }),
    shellWall('wall:east', { x: SHELL_WIDTH_X, y: 0 }, { x: SHELL_WIDTH_X, y: SHELL_DEPTH_Z }),
    shellWall('wall:north', { x: SHELL_WIDTH_X, y: SHELL_DEPTH_Z }, { x: 0, y: SHELL_DEPTH_Z }),
    shellWall('wall:west', { x: 0, y: SHELL_DEPTH_Z }, { x: 0, y: 0 }),
  ],
  rooms: [SHELL_ROOM],
  underlays: [],
  openings: [SHELL_DOOR],
  dimensions: [],
  stairs: [],
}

// Fits the camera to the bounds for the pinned canvas size, then renders exactly one
// frame on mount and never again, so the screenshot is deterministic and never races
// an animation tick (the Canvas runs in `frameloop="never"`). Fitting here (rather
// than only at scene build) frames the model to the harness aspect ratio and field
// of view, matching the live preview (ADR-0075).
function StaticFrame({ bounds }: { bounds: Bounds3 | null }) {
  const { gl, scene, camera, size } = useThree()
  useLayoutEffect(() => {
    fitCameraToBounds(camera, bounds, size)
    gl.render(scene, camera)
  }, [gl, scene, camera, bounds, size])
  return null
}

/**
 * A deterministic, test-only three-dimensional render harness. It boots the same
 * scene-plus-basic-lighting pipeline production uses against a fixed wall-shell fixture,
 * pins the canvas size, uses a fixed opaque background, forces the WebGL 2 backend, and
 * renders a single static frame. The Playwright visual baseline screenshots this canvas.
 * It is mounted only when the `?fixture=scene-harness` query parameter is present (see
 * the App), so a normal page load never reaches it.
 */
export function SceneHarnessView({
  colorTemperatureK = DEFAULT_COLOR_TEMPERATURE_K,
  paint = {},
}: {
  // Admits undefined (not just absent) so the App can forward an optional query
  // parameter under exactOptionalPropertyTypes; the default applies either way.
  colorTemperatureK?: number | undefined
  paint?: Record<string, SurfaceTreatment> | undefined
} = {}) {
  const { root, pose, bounds } = useMemo(() => buildFramedScene(SHELL_FIXTURE, paint), [paint])

  return (
    <div data-testid="scene-harness" style={{ width: HARNESS_WIDTH, height: HARNESS_HEIGHT }}>
      <Canvas
        frameloop="never"
        camera={{
          position: [pose.position.x, pose.position.y, pose.position.z],
          near: pose.near,
          far: pose.far,
        }}
        // Force the WebGL 2 backend so the committed baseline is a hardware-WebGL render
        // that never collides with a future WebGPU baseline.
        gl={(defaultProps) =>
          createSceneRenderer({
            canvas: defaultProps.canvas as HTMLCanvasElement,
            forceWebGL: true,
          })
        }
      >
        <color attach="background" args={[HARNESS_BACKGROUND]} />
        <primitive object={root} />
        <SceneLighting colorTemperatureK={colorTemperatureK} bounds={bounds} />
        <StaticFrame bounds={bounds} />
      </Canvas>
    </div>
  )
}
