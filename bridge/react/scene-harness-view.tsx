import { Canvas, useThree } from '@react-three/fiber'
import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import {
  DEFAULT_COLOR_TEMPERATURE_K,
  furnitureFootprintCorners,
  type Bounds3,
  type CameraPose,
  type FurnitureSceneNode,
  type ObservationInstant,
  type OpeningSceneNode,
  type Point,
  type RoomSceneNode,
  type SceneGraph,
  type Site,
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

// The single room the four walls enclose: its floor slab and ceiling render
// alongside the walls so the harness baseline covers the room shell. The slab
// reaches the walls' outer faces (`outerPolygon`, ADR-0076) while the ceiling
// stays over the clear interior (`clearPolygon`).
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
  // The centerline rectangle grown outward by the same half-thickness, so the slab
  // meets the outer faces of the walls rather than their inner faces.
  outerPolygon: [
    { x: -SHELL_CLEAR_INSET, y: -SHELL_CLEAR_INSET },
    { x: SHELL_WIDTH_X + SHELL_CLEAR_INSET, y: -SHELL_CLEAR_INSET },
    { x: SHELL_WIDTH_X + SHELL_CLEAR_INSET, y: SHELL_DEPTH_Z + SHELL_CLEAR_INSET },
    { x: -SHELL_CLEAR_INSET, y: SHELL_DEPTH_Z + SHELL_CLEAR_INSET },
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

// A double-hung window centered in the east wall, so the harness baseline shows a
// sash frame and a semi-transparent glass pane (the room reading through it). The
// east wall runs along +y, so `along` is {0, 1} and the wall normal is across it.
const WINDOW_WIDTH = 1000
const WINDOW_HEIGHT = 1200
const WINDOW_SILL = 900
const SHELL_WINDOW: OpeningSceneNode = {
  id: 'opening:east-window',
  kind: 'opening',
  floorId: 'demo',
  type: 'double-hung-window',
  hostWallId: 'east',
  center: { x: SHELL_WIDTH_X, y: SHELL_DEPTH_Z / 2 },
  along: { x: 0, y: 1 },
  normal: { x: 1, y: 0 },
  width: WINDOW_WIDTH,
  height: WINDOW_HEIGHT,
  sillHeight: WINDOW_SILL,
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
  openings: [SHELL_DOOR, SHELL_WINDOW],
  dimensions: [],
  stairs: [],
  furniture: [],
}

// A second fixture that exercises the generalized junction geometry (ADR-0080): a
// through-wall with a partition teeing into its middle (a T-junction, which
// buildWallGraph splits at the tee), whose far end is a three-way apex where two bay
// walls fan out at an acute angle. The baseline confirms these busier junctions read
// as one solid with opaque tops and no spikes, which the four-corner shell does not
// cover. Walls only (no rooms or openings), so the frame is the junction geometry.
const JUNCTION_APEX: Point = { x: 2000, y: 2000 }
const JUNCTION_FIXTURE: SceneGraph = {
  nodes: [{ id: 'floor:demo', kind: 'floor', name: 'Demo', elevation: 0 }],
  walls: [
    // Through-wall; the partition's foot at (2000, 0) splits it into a T-junction.
    shellWall('wall:through', { x: 0, y: 0 }, { x: 4000, y: 0 }),
    shellWall('wall:partition', { x: 2000, y: 0 }, JUNCTION_APEX),
    // Two bay walls fan from the apex at an acute included angle: a three-way junction.
    shellWall('wall:bay-left', JUNCTION_APEX, { x: 1500, y: 4000 }),
    shellWall('wall:bay-right', JUNCTION_APEX, { x: 2500, y: 4000 }),
  ],
  rooms: [],
  underlays: [],
  openings: [],
  dimensions: [],
  stairs: [],
  furniture: [],
}

// A third fixture that places one furniture massing box in the middle of the wall
// shell, so the baseline confirms a placed piece renders as a solid neutral prism
// standing on the floor at its footprint and height (the massing model, ADR-0094).
// A 1200 by 600 mm footprint, 1500 mm tall (a cabinet, chosen tall enough to read
// clearly against the neutral floor), centered in the 4000 by 3000 mm room at
// elevation 0. The corners come from the same helper the scene graph derives with.
const FURNITURE_WIDTH = 1200
const FURNITURE_DEPTH = 600
const FURNITURE_BOX_HEIGHT = 1500
const FURNITURE_CENTER: Point = { x: SHELL_WIDTH_X / 2, y: SHELL_DEPTH_Z / 2 }
const SHELL_FURNITURE: FurnitureSceneNode = {
  id: 'furniture:demo-piece',
  kind: 'furniture',
  floorId: 'demo',
  footprintCorners: furnitureFootprintCorners(FURNITURE_CENTER, 0, {
    width: FURNITURE_WIDTH,
    depth: FURNITURE_DEPTH,
  }),
  elevationZ: 0,
  height: FURNITURE_BOX_HEIGHT,
  assetRef: { scope: 'project', contentHash: 'harness-only' },
}
const FURNITURE_FIXTURE: SceneGraph = {
  ...SHELL_FIXTURE,
  furniture: [SHELL_FURNITURE],
}

/** The harness fixtures, selected by the `scene` prop / `?scene=` query parameter. */
const HARNESS_FIXTURES = {
  shell: SHELL_FIXTURE,
  junctions: JUNCTION_FIXTURE,
  furniture: FURNITURE_FIXTURE,
} as const

/** Which harness fixture to render; defaults to the wall-shell room. */
export type HarnessScene = keyof typeof HARNESS_FIXTURES

// Fits the camera to the bounds for the pinned canvas size, then renders one frame on
// mount and one more when the lighting reports ready, so the screenshot is deterministic
// and never races an animation tick (the Canvas runs in `frameloop="never"`). The mount
// frame keeps the canvas from sitting blank while asynchronous lighting (the solar
// provider's lazily loaded sky) attaches; the ready frame is the one the baselines
// capture, awaited through the wrapper's data-harness-ready attribute. Fitting here
// (rather than only at scene build) frames the model to the harness aspect ratio and
// field of view, matching the live preview (ADR-0075).
function StaticFrame({
  bounds,
  lightingReady,
}: {
  bounds: Bounds3 | null
  lightingReady: boolean
}) {
  const { gl, scene, camera, size } = useThree()
  useLayoutEffect(() => {
    fitCameraToBounds(camera, bounds, size)
    gl.render(scene, camera)
  }, [gl, scene, camera, bounds, size, lightingReady])
  return null
}

/**
 * A canonical environment override for the harness: a site, an observation instant,
 * the realistic-lighting flag, and the optional cloud-cover fraction and color-check
 * flag that some named states set. Structurally matches the app layer's named
 * environment states without the bridge importing from app/.
 */
export interface HarnessEnvironment {
  site: Site
  observedAt: ObservationInstant
  realistic: boolean
  cloudCover?: number
  colorCheck?: boolean
}

// Forwards the canonical environment override, when present, so its site,
// observation instant, cloud cover, and color-check flag drive the realistic solar
// provider. Without one, SceneLighting's own schematic defaults apply (realistic
// off, no site). The readiness callback bubbles up so the harness can render its
// captured frame only after asynchronous lighting (the lazy sky) has attached.
function HarnessLighting({
  colorTemperatureK,
  bounds,
  environment,
  onReady,
}: {
  colorTemperatureK: number
  bounds: Bounds3 | null
  environment?: HarnessEnvironment | undefined
  onReady: () => void
}) {
  return (
    <SceneLighting
      colorTemperatureK={colorTemperatureK}
      bounds={bounds}
      realistic={environment?.realistic}
      site={environment?.site}
      observedAt={environment?.observedAt}
      cloudCover={environment?.cloudCover}
      colorCheck={environment?.colorCheck}
      onReady={onReady}
    />
  )
}

/**
 * A deterministic, test-only three-dimensional render harness. It boots the same
 * scene-plus-basic-lighting pipeline production uses against a fixed wall-shell fixture,
 * pins the canvas size, uses a fixed opaque background, forces the WebGL 2 backend, and
 * renders a single static frame. The Playwright visual baseline screenshots this canvas.
 * It is mounted only when the `?fixture=scene-harness` query parameter is present (see
 * the App), so a normal page load never reaches it.
 */
interface SceneHarnessViewProps {
  // Admits undefined (not just absent) so the App can forward an optional query
  // parameter under exactOptionalPropertyTypes; the default applies either way.
  colorTemperatureK?: number | undefined
  paint?: Record<string, SurfaceTreatment> | undefined
  scene?: HarnessScene | undefined
  environment?: HarnessEnvironment | undefined
}

// The framed pose as the Canvas camera props: the fitted position with the near and
// far planes the framing computed (ADR-0075).
function harnessCameraProps(pose: CameraPose) {
  return {
    position: [pose.position.x, pose.position.y, pose.position.z] as [number, number, number],
    near: pose.near,
    far: pose.far,
  }
}

// Flips once the lighting provider's asynchronous resources (the lazy sky) attach.
// The wrapper advertises it as data-harness-ready, which the visual specs await
// before screenshotting: React commits the attribute in the same pass whose layout
// effect renders the ready frame, so an observable "true" implies the frame exists.
function useHarnessLightingReadiness() {
  const [lightingReady, setLightingReady] = useState(false)
  const handleLightingReady = useCallback(() => setLightingReady(true), [])
  return { lightingReady, handleLightingReady }
}

export function SceneHarnessView({
  colorTemperatureK = DEFAULT_COLOR_TEMPERATURE_K,
  paint = {},
  scene = 'shell',
  environment,
}: SceneHarnessViewProps = {}) {
  const fixture = HARNESS_FIXTURES[scene]
  const { root, pose, bounds } = useMemo(() => buildFramedScene(fixture, paint), [fixture, paint])
  const { lightingReady, handleLightingReady } = useHarnessLightingReadiness()

  return (
    <div
      data-testid="scene-harness"
      data-harness-ready={lightingReady ? 'true' : 'false'}
      style={{ width: HARNESS_WIDTH, height: HARNESS_HEIGHT }}
    >
      <Canvas
        frameloop="never"
        camera={harnessCameraProps(pose)}
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
        <HarnessLighting
          colorTemperatureK={colorTemperatureK}
          bounds={bounds}
          environment={environment}
          onReady={handleLightingReady}
        />
        <StaticFrame bounds={bounds} lightingReady={lightingReady} />
      </Canvas>
    </div>
  )
}
