import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import {
  accumulatePointerLook,
  advanceWalk,
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
import { restoreOpenings, tickOpenings } from './walk-interaction'
import {
  resumedWalkState,
  walkFloorElevationMm,
  walkKeyHandlers,
  type WalkCamera,
  type WalkRefs,
  type WalkSession,
  type WalkSessionHost,
} from './walk-session'

const LOOK_SENSITIVITY_RAD_PER_PX = 0.0025

// The walker's horizontal collision radius, in millimeters: how far the eye stays
// clear of any wall. About half a person's shoulder width, wide enough to keep the
// camera off the wall surface yet narrow enough to step through a doorway.
const WALK_RADIUS_MM = 250

function emptyWalkInput(): WalkInput {
  return { forward: false, back: false, left: false, right: false, yawDelta: 0, pitchDelta: 0 }
}

function initialWalkState(floorElevationMm: number): WalkState {
  return {
    position: { x: 0, y: floorElevationMm + WALK_EYE_HEIGHT_MM, z: 0 },
    yaw: 0,
    pitch: 0,
  }
}

// Resumes the walk state (or seeds it from the camera the first time), seats the doors the
// last session left open, takes control of the camera, and wires the keyboard,
// click-to-capture, and pointer-look listeners. Movement keys act independently of pointer
// capture; the pointer only drives look while captured. Returns a teardown that hands the
// pose back, removes the listeners, releases capture, and clears held input.
function startWalk(session: WalkSession): () => void {
  const { camera, domElement, state, input, onUserControl, floorElevationMm } = session
  const { savedWalkPose, onWalkPose, root, openings, interaction, openness } = session
  state.current = resumedWalkState(savedWalkPose, camera, floorElevationMm)
  restoreOpenings({
    root,
    openings: openings.current,
    interaction: interaction.current,
    openness: openness.current,
  })
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
    // Reported first, while the pose is still the one the walker was looking through: this
    // teardown runs both when the view mode unmounts the canvas and when a detour into orbit
    // re-runs the effect, and either way the next session resumes from here.
    onWalkPose(state.current)
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
  /** The active floor's elevation, in millimeters; 0 when no floor is active. */
  floorElevationMm: number
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
      floorElevationMm: walkFloorElevationMm(graph),
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
// in-flight openness. They are walk-session view-state, never persisted edits. The
// open/closed state starts on the doors a previous session left open, copied so this
// session's toggles never reach back into the caller's set (ADR-0170).
function useWalkInteraction(savedOpenDoorIds: ReadonlySet<string>): {
  openingsRef: RefObject<OpeningSceneNode[]>
  interactionRef: RefObject<OpeningInteractionState>
  opennessRef: RefObject<Map<string, number>>
} {
  const openings = useWalkOpenings()
  const openingsRef = useRef<OpeningSceneNode[]>(openings)
  openingsRef.current = openings
  const interactionRef = useRef<OpeningInteractionState>({ openIds: new Set(savedOpenDoorIds) })
  const opennessRef = useRef<Map<string, number>>(new Map())
  return { openingsRef, interactionRef, opennessRef }
}

// The live inputs the per-frame walk step reads: the camera and scene root it
// writes to, the collision inputs, and the walk and interaction refs it advances.
interface WalkFrameContext extends WalkRefs {
  camera: WalkCamera
  collisionInputs: WalkCollisionInputs
  root: SceneRoot
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
  savedWalkPose: WalkState | null
  onWalkPose: (pose: WalkState) => void
  /** The doors a previous walk left open, read once when this session starts. */
  savedOpenDoorIds: ReadonlySet<string>
  /** Reports which doors stand open, so the next session opens the same ones. */
  onOpenDoors: (openIds: ReadonlySet<string>) => void
}

// The pose handoff, held in refs refreshed on every render so that neither the saved pose
// nor the identity of the reporting callback joins the mount effect's dependencies and
// restarts the walk. The orbit controller holds its onLeave callback the same way.
function useWalkPoseHandoff(
  savedWalkPose: WalkState | null,
  onWalkPose: (pose: WalkState) => void,
): {
  savedWalkPoseRef: RefObject<WalkState | null>
  onWalkPoseRef: RefObject<(pose: WalkState) => void>
} {
  const savedWalkPoseRef = useRef(savedWalkPose)
  savedWalkPoseRef.current = savedWalkPose
  const onWalkPoseRef = useRef(onWalkPose)
  onWalkPoseRef.current = onWalkPose
  return { savedWalkPoseRef, onWalkPoseRef }
}

// The props a walk session reads: everything the component takes except the scene
// root, which reaches the session through its host.
type WalkSessionProps = Omit<WalkCameraControlsProps, 'root'>

// Runs a walk session for as long as walk mode is on: it holds the refs a walk advances,
// starts the session when the mode turns on, and tears it down (reporting the pose back)
// when it turns off or the canvas goes away. The refs come back so the frame loop steps
// the same state the session started.
function useWalkSession(props: WalkSessionProps, host: WalkSessionHost): WalkRefs {
  const { enabled, onUserControl, savedWalkPose, onWalkPose, onOpenDoors } = props
  const { camera, domElement, root, floorElevationMm } = host
  const stateRef = useRef<WalkState>(initialWalkState(floorElevationMm))
  const inputRef = useRef<WalkInput>(emptyWalkInput())
  const { openingsRef, interactionRef, opennessRef } = useWalkInteraction(props.savedOpenDoorIds)
  const { savedWalkPoseRef, onWalkPoseRef } = useWalkPoseHandoff(savedWalkPose, onWalkPose)
  const onOpenDoorsRef = useRef(onOpenDoors)
  onOpenDoorsRef.current = onOpenDoors

  useEffect(() => {
    if (!enabled) return
    return startWalk({
      camera,
      domElement,
      root,
      state: stateRef,
      input: inputRef,
      openings: openingsRef,
      interaction: interactionRef,
      openness: opennessRef,
      onUserControl,
      floorElevationMm,
      savedWalkPose: savedWalkPoseRef.current,
      onWalkPose: (pose) => onWalkPoseRef.current(pose),
      onOpenDoors: (openIds) => onOpenDoorsRef.current(openIds),
    })
    // Four values are deliberately left out of the dependencies below. floorElevationMm and
    // root are read only as the session starts, and a mid-walk change to either must not
    // restart the walk and drop pointer capture; re-seeding the walk pose when the active
    // floor changes mid-walk is tracked by #608 and lands in a later cycle. savedWalkPoseRef,
    // onWalkPoseRef, and onOpenDoorsRef are refs refreshed on every render, so reading them
    // here cannot go stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, camera, domElement, onUserControl, openingsRef, interactionRef, opennessRef])

  return {
    state: stateRef,
    input: inputRef,
    openings: openingsRef,
    interaction: interactionRef,
    openness: opennessRef,
  }
}

/**
 * Hand-rolled first-person walk: WASD movement (active whenever walk mode is on,
 * independent of pointer capture), pointer-lock mouse-look, and the E "use" key
 * that opens or closes the opening the walker faces within reach. It reads the
 * pure walk and interaction math from core and applies the result to the live
 * camera and the scene each frame; the only Three.js touch is handing the scene
 * root to the engine swing helper. Entering walk mode resumes the pose the last
 * walk left behind and the doors it left open, or seeds the camera at eye height on
 * the first walk, and takes control of the camera; leaving reports both back, so the
 * walk survives a view switch and a detour through orbit (ADR-0170). This is rendering
 * glue that only runs under a real WebGPU canvas (foundation 6.3); its behavior is
 * proven by the scene-webgl navigation e2e.
 */
export function WalkCameraControls(props: WalkCameraControlsProps) {
  // Kept as one props object because the session hook reads the same shape minus the root.
  const { enabled, root } = props
  const camera = useThree((state) => state.camera)
  const domElement = useThree((state) => state.gl.domElement)
  const collisionInputs = useWalkCollisionInputs()
  const walkRefs = useWalkSession(props, {
    camera,
    domElement,
    root,
    floorElevationMm: collisionInputs.floorElevationMm,
  })

  useFrame((_state, delta) => {
    if (!enabled) return
    stepWalkFrame({ camera, collisionInputs, root, ...walkRefs }, delta)
  })

  return null
}
