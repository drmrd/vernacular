import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import {
  accumulatePointerLook,
  advanceWalk,
  emptyOpeningInteraction,
  furnitureSegmentsForWalk,
  passableDoorIds,
  sceneGraphForFloor,
  walkLookTarget,
  wallSegmentsForWalk,
  WALK_EYE_HEIGHT_MM,
  type OpeningInteractionState,
  type OpeningSceneNode,
  type WallSceneNode,
  type WallSegment,
  type WalkCollisionWorld,
  type WalkInput,
  type WalkState,
} from '../../core'
import type { SceneRoot } from '../../engine'
import { useActiveFloorId } from './active-floor-context'
import { useSceneGraph } from './use-scene-graph'
import { interactFromWalk, tickOpenings } from './walk-interaction'

const LOOK_SENSITIVITY_RAD_PER_PX = 0.0025

// The walker's horizontal collision radius, in millimeters: how far the eye stays
// clear of any wall. About half a person's shoulder width, wide enough to keep the
// camera off the wall surface yet narrow enough to step through a doorway.
const WALK_RADIUS_MM = 250

// Maps a keyboard code to the movement flag it drives. A Map keeps the lookup result
// `... | undefined`, so an unmapped key (anything but WASD) is ignored cleanly.
const MOVEMENT_KEYS = new Map<string, 'forward' | 'back' | 'left' | 'right'>([
  ['KeyW', 'forward'],
  ['KeyS', 'back'],
  ['KeyA', 'left'],
  ['KeyD', 'right'],
])

// The "use" key, the conventional first-person interact verb. It is read as a general
// interact action so other interactables (lights, drawers) can hook in here later.
const INTERACT_KEY = 'KeyE'

// The reset key: clears every opened opening so they animate shut.
const RESET_KEY = 'KeyR'

// The subset of the three camera this wrapper reads and writes, declared structurally
// so the file types the camera without importing three (rules.md rule 1).
interface WalkCamera {
  position: { x: number; y: number; z: number; set(x: number, y: number, z: number): void }
  matrixWorld: { elements: ArrayLike<number> }
  updateWorldMatrix(updateParents: boolean, updateChildren: boolean): void
  lookAt(x: number, y: number, z: number): void
}

function emptyWalkInput(): WalkInput {
  return { forward: false, back: false, left: false, right: false, yawDelta: 0, pitchDelta: 0 }
}

function initialWalkState(): WalkState {
  return { position: { x: 0, y: WALK_EYE_HEIGHT_MM, z: 0 }, yaw: 0, pitch: 0 }
}

// Seeds a walk state from the camera's current eye-level position and heading so
// entering walk mode does not teleport the view. A camera looks down the negated
// third column of its world matrix; yaw and pitch come from that forward vector.
function seedWalkState(camera: WalkCamera): WalkState {
  camera.updateWorldMatrix(true, false)
  const e = camera.matrixWorld.elements
  // The forward axis is elements [8, 9, 10] of the column-major matrixWorld (the
  // third column's XYZ), negated; default to facing -Z if any element is absent.
  const fx = e[8] ?? 0
  const fy = e[9] ?? 0
  const fz = e[10] ?? -1
  const length = Math.hypot(fx, fy, fz) || 1
  const forward = { x: -fx / length, y: -fy / length, z: -fz / length }
  return {
    position: { x: camera.position.x, y: WALK_EYE_HEIGHT_MM, z: camera.position.z },
    yaw: Math.atan2(forward.x, -forward.z),
    pitch: Math.asin(Math.max(-1, Math.min(1, forward.y))),
  }
}

interface WalkSession {
  camera: WalkCamera
  domElement: HTMLElement
  state: RefObject<WalkState>
  input: RefObject<WalkInput>
  openings: RefObject<OpeningSceneNode[]>
  interaction: RefObject<OpeningInteractionState>
  openness: RefObject<Map<string, number>>
  onUserControl: () => void
}

// Builds the keydown and keyup handlers. Keydown routes the interact key to the
// opening under the walker's gaze and every other code to its movement flag;
// keyup clears the movement flag. The interact key takes no movement flag, so it
// never leaves a key stuck down.
// eslint-disable-next-line react-refresh/only-export-components -- the keyboard handler builder ships beside the component that installs it and this slice's test imports walkKeyHandlers from ./walk-camera-controls.
export function walkKeyHandlers(session: WalkSession): {
  onKeyDown: (event: KeyboardEvent) => void
  onKeyUp: (event: KeyboardEvent) => void
} {
  const { state, input, openings, interaction, openness, onUserControl } = session
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.code === INTERACT_KEY) {
      // Pass the live openness so the ray reaches an opening at its swung or slid
      // position, letting the walker close a door that is already open.
      interaction.current = interactFromWalk(
        state.current,
        openings.current,
        interaction.current,
        openness.current,
      )
      onUserControl()
      return
    }
    if (event.code === RESET_KEY) {
      // The per-frame tick animates each opening shut from its current openness.
      interaction.current = emptyOpeningInteraction()
      onUserControl()
      return
    }
    const flag = MOVEMENT_KEYS.get(event.code)
    if (flag === undefined) return
    input.current[flag] = true
    onUserControl()
  }
  const onKeyUp = (event: KeyboardEvent) => {
    const flag = MOVEMENT_KEYS.get(event.code)
    if (flag !== undefined) input.current[flag] = false
  }
  return { onKeyDown, onKeyUp }
}

// Seeds the walk state, takes control of the camera, and wires the keyboard,
// click-to-capture, and pointer-look listeners. Movement keys act independently of
// pointer capture; the pointer only drives look while captured. Returns a teardown
// that removes the listeners, releases capture, and clears held input.
function startWalk(session: WalkSession): () => void {
  const { camera, domElement, state, input, onUserControl } = session
  state.current = seedWalkState(camera)
  // Mark user-controlled immediately so FrameCamera stops reapplying the framed pose
  // and the walk controller owns the camera from the first frame.
  onUserControl()
  const { onKeyDown, onKeyUp } = walkKeyHandlers(session)
  const onClick = () => void domElement.requestPointerLock()
  const onPointerMove = (event: PointerEvent) => {
    if (document.pointerLockElement !== domElement) return
    input.current = accumulatePointerLook(
      input.current,
      event.movementX,
      event.movementY,
      LOOK_SENSITIVITY_RAD_PER_PX,
    )
  }
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  domElement.addEventListener('click', onClick)
  window.addEventListener('pointermove', onPointerMove)
  return () => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    domElement.removeEventListener('click', onClick)
    window.removeEventListener('pointermove', onPointerMove)
    if (document.pointerLockElement === domElement) document.exitPointerLock()
    input.current = emptyWalkInput()
  }
}

// The static collision inputs for the active floor: its walls and openings, the
// precomputed furniture perimeter segments, and the walker's radius. The per-frame
// step combines these with the live open-door set to build the collision world, so
// these need rebuild only when the scene graph or active floor changes.
interface WalkCollisionInputs {
  walls: readonly WallSceneNode[]
  openings: readonly OpeningSceneNode[]
  furnitureSegments: WallSegment[]
  radius: number
}

function useWalkCollisionInputs(): WalkCollisionInputs {
  const rawGraph = useSceneGraph()
  const activeFloorId = useActiveFloorId()
  return useMemo(() => {
    const graph = sceneGraphForFloor(rawGraph, activeFloorId)
    return {
      walls: graph.walls,
      openings: graph.openings,
      furnitureSegments: furnitureSegmentsForWalk(graph.furniture),
      radius: WALK_RADIUS_MM,
    }
  }, [rawGraph, activeFloorId])
}

// The openings on the active floor, the candidates an interact ray can land on.
// It rebuilds only when the scene graph or active floor changes, like the
// collision world above.
function useWalkOpenings(): OpeningSceneNode[] {
  const rawGraph = useSceneGraph()
  const activeFloorId = useActiveFloorId()
  return useMemo(
    () => sceneGraphForFloor(rawGraph, activeFloorId).openings,
    [rawGraph, activeFloorId],
  )
}

// The refs the interact key and the per-frame swing read: the live openings (kept
// current for the keydown closure), the open/closed view-state, and each opening's
// in-flight openness. They are walk-session view-state, never persisted edits.
function useWalkInteraction(): {
  openingsRef: RefObject<OpeningSceneNode[]>
  interactionRef: RefObject<OpeningInteractionState>
  opennessRef: RefObject<Map<string, number>>
} {
  const openings = useWalkOpenings()
  const openingsRef = useRef<OpeningSceneNode[]>(openings)
  openingsRef.current = openings
  const interactionRef = useRef<OpeningInteractionState>(emptyOpeningInteraction())
  const opennessRef = useRef<Map<string, number>>(new Map())
  return { openingsRef, interactionRef, opennessRef }
}

// The live inputs the per-frame walk step reads: the camera and scene root it
// writes to, the collision inputs, and the walk and interaction refs it advances.
interface WalkFrameContext {
  camera: WalkCamera
  collisionInputs: WalkCollisionInputs
  root: SceneRoot
  state: RefObject<WalkState>
  input: RefObject<WalkInput>
  openings: RefObject<OpeningSceneNode[]>
  interaction: RefObject<OpeningInteractionState>
  openness: RefObject<Map<string, number>>
}

// Builds this frame's collision world from the static inputs and the live open-door
// set: passable openings cut gaps in their host walls and furniture footprints always
// block. passableDoorIds decides what counts as passable, which is open doors plus
// leafless doorways that have nothing to open; shut doors and windows stay solid.
function frameCollisionWorld(ctx: WalkFrameContext): WalkCollisionWorld {
  const { walls, openings, furnitureSegments, radius } = ctx.collisionInputs
  const passable = passableDoorIds(openings, ctx.interaction.current.openIds)
  return {
    segments: [...wallSegmentsForWalk(walls, openings, passable), ...furnitureSegments],
    radius,
  }
}

// Advances the walk one timestep: steps the walk state against the collision
// world, drives the live camera to the new eye and look, and swings any opening
// that is mid open or close. The look deltas are consumed so they do not re-apply.
function stepWalkFrame(ctx: WalkFrameContext, delta: number): void {
  const next = advanceWalk(ctx.state.current, ctx.input.current, delta, frameCollisionWorld(ctx))
  ctx.input.current.yawDelta = 0
  ctx.input.current.pitchDelta = 0
  ctx.state.current = next
  ctx.camera.position.set(next.position.x, next.position.y, next.position.z)
  const look = walkLookTarget(next)
  ctx.camera.lookAt(look.x, look.y, look.z)
  tickOpenings(
    {
      root: ctx.root,
      openings: ctx.openings.current,
      interaction: ctx.interaction.current,
      openness: ctx.openness.current,
    },
    delta,
  )
}

interface WalkCameraControlsProps {
  enabled: boolean
  onUserControl: () => void
  root: SceneRoot
}

/**
 * Hand-rolled first-person walk: WASD movement (active whenever walk mode is on,
 * independent of pointer capture), pointer-lock mouse-look, and the E "use" key
 * that opens or closes the opening the walker faces within reach. It reads the
 * pure walk and interaction math from core and applies the result to the live
 * camera and the scene each frame; the only Three.js touch is handing the scene
 * root to the engine swing helper. Entering walk mode seeds the camera at eye
 * height and takes control of it. This is rendering glue that only runs under a
 * real WebGPU canvas (foundation 6.3); its behavior is proven by the scene-webgl
 * navigation e2e.
 */
export function WalkCameraControls({ enabled, onUserControl, root }: WalkCameraControlsProps) {
  const camera = useThree((state) => state.camera)
  const domElement = useThree((state) => state.gl.domElement)
  const stateRef = useRef<WalkState>(initialWalkState())
  const inputRef = useRef<WalkInput>(emptyWalkInput())
  const collisionInputs = useWalkCollisionInputs()
  const { openingsRef, interactionRef, opennessRef } = useWalkInteraction()

  useEffect(() => {
    if (!enabled) return
    return startWalk({
      camera,
      domElement,
      state: stateRef,
      input: inputRef,
      openings: openingsRef,
      interaction: interactionRef,
      openness: opennessRef,
      onUserControl,
    })
  }, [enabled, camera, domElement, onUserControl, openingsRef, interactionRef, opennessRef])

  useFrame((_state, delta) => {
    if (!enabled) return
    stepWalkFrame(
      {
        camera,
        collisionInputs,
        root,
        state: stateRef,
        input: inputRef,
        openings: openingsRef,
        interaction: interactionRef,
        openness: opennessRef,
      },
      delta,
    )
  })

  return null
}
