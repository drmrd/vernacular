import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import {
  accumulatePointerLook,
  furnitureSegmentsForWalk,
  sceneGraphForFloor,
  type OpenParts,
  type WalkInput,
  type WalkState,
} from '../../core'
import type { SceneRoot } from '../../engine'
import { useActiveFloorId } from './active-floor-context'
import { tickOpeningMotion, useOpeningMotion, type OpeningMotionRefs } from './use-opening-motion'
import { useSceneGraph } from './use-scene-graph'
import {
  emptyWalkInput,
  initialWalkState,
  resumedWalkState,
  stepWalkFrame,
  walkFloorElevationMm,
  walkKeyHandlers,
  type WalkCollisionInputs,
  type WalkRefs,
  type WalkSession,
  type WalkSessionHost,
} from './walk-session'

const LOOK_SENSITIVITY_RAD_PER_PX = 0.0025

// The walker's horizontal collision radius, in millimeters: how far the eye stays
// clear of any wall. About half a person's shoulder width, wide enough to keep the
// camera off the wall surface yet narrow enough to step through a doorway.
const WALK_RADIUS_MM = 250

// Resumes the walk state (or seeds it from the camera the first time), takes control of the
// camera, and wires the keyboard, click-to-capture, and pointer-look listeners. A walk
// poses no door: the opening motion hook poses the shown openings on each new scene root and
// on each change of the shown list, and its per-frame tick keeps every opening the view shows
// on the open parts. Movement keys act independently of pointer capture;
// the pointer only drives look while captured. Returns a teardown that hands the pose back,
// removes the listeners, releases capture, and clears held input.
function startWalk(session: WalkSession): () => void {
  const { camera, domElement, state, input, onUserControl, floorElevationMm } = session
  const { savedWalkPose, onWalkPose } = session
  state.current = resumedWalkState(savedWalkPose, camera, floorElevationMm)
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

interface WalkCameraControlsProps {
  enabled: boolean
  onUserControl: () => void
  root: SceneRoot
  savedWalkPose: WalkState | null
  onWalkPose: (pose: WalkState) => void
  /**
   * The open parts the session store holds, by opening. The live openings follow this map whenever it
   * changes, in both camera modes, so a reset made outside a walk animates the doors shut.
   */
  storedOpenDoorIds: OpenParts
  /** Reports which doors stand open after each E or R press. */
  onOpenDoors: (openParts: OpenParts) => void
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

// The props a walk session reads: everything the component takes except the scene root,
// which only the opening motion hook and the frame callback use, and the stored open parts,
// which the opening motion hook follows.
type WalkSessionProps = Omit<WalkCameraControlsProps, 'root' | 'storedOpenDoorIds'>

// Runs a walk session for as long as walk mode is on: it holds the walker's pose and held
// input, starts the session (with the opening refs the opening motion hook owns) when the
// mode turns on, and tears it down (reporting the pose back) when it turns off or the canvas
// goes away. All the refs come back so the frame loop steps the same state the session
// started.
function useWalkSession(
  props: WalkSessionProps,
  host: WalkSessionHost,
  openingRefs: OpeningMotionRefs,
): WalkRefs {
  const { enabled, onUserControl, savedWalkPose, onWalkPose, onOpenDoors } = props
  const { camera, domElement, floorElevationMm } = host
  const stateRef = useRef<WalkState>(initialWalkState(floorElevationMm))
  const inputRef = useRef<WalkInput>(emptyWalkInput())
  const { openings: openingsRef, interaction: interactionRef, openness: opennessRef } = openingRefs
  const { savedWalkPoseRef, onWalkPoseRef } = useWalkPoseHandoff(savedWalkPose, onWalkPose)
  const onOpenDoorsRef = useRef(onOpenDoors)
  onOpenDoorsRef.current = onOpenDoors

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
      floorElevationMm,
      savedWalkPose: savedWalkPoseRef.current,
      onWalkPose: (pose) => onWalkPoseRef.current(pose),
      onOpenDoors: (openParts) => onOpenDoorsRef.current(openParts),
    })
    // Four values are deliberately left out of the dependencies below. floorElevationMm is
    // read only as the session starts, and a mid-walk change to it must not restart the walk
    // and drop pointer capture; the frame step seats the eye on the active floor at every
    // step, so a change of floor or elevation needs no restart. savedWalkPoseRef,
    // onWalkPoseRef, and onOpenDoorsRef are refs refreshed on every render, so reading them
    // here cannot go stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, camera, domElement, onUserControl, openingsRef, interactionRef, opennessRef])

  return { state: stateRef, input: inputRef, ...openingRefs }
}

/**
 * Hand-rolled first-person walk: WASD movement (active whenever walk mode is on,
 * independent of pointer capture), pointer-lock mouse-look, and the E "use" key
 * that opens or closes the opening the walker faces within reach. It reads the
 * pure walk and interaction math from core and applies the result to the live
 * camera and the scene each frame; the only Three.js touch is handing the scene
 * root to the engine swing helper. Entering walk mode resumes the pose the last
 * walk left behind (or seeds the camera at eye height on the first walk) and takes
 * control of the camera; each E or R press reports which doors stand open, and leaving
 * reports the pose back, so the walk survives a view switch and a detour through orbit
 * (ADR-0170). The openings stay live in orbit mode too: useOpeningMotion has them follow
 * the doors the session store holds open and poses each new scene root, and the
 * per-frame tick swings every opening the view shows toward those parts in either mode. A
 * walk start poses nothing itself. The unit tests of the opening
 * motion hook (use-opening-motion.test.tsx and use-opening-motion-floors.test.tsx) cover the
 * follow of the stored set, the pose of a new root before any tick, the order of the two in one
 * render, and the openings of every shown floor. The
 * frame callback below runs only under a real WebGPU canvas (foundation 6.3). The
 * close-doors-and-windows journey runs it on a live view and sees the openings swing in
 * both camera modes; no test asserts the order of the tick after the walk step.
 */
export function WalkCameraControls(props: WalkCameraControlsProps) {
  // Kept as one props object because the session hook reads the same shape minus the root
  // and the stored open parts.
  const { enabled, root, storedOpenDoorIds } = props
  const camera = useThree((state) => state.camera)
  const domElement = useThree((state) => state.gl.domElement)
  const collisionInputs = useWalkCollisionInputs()
  const openingRefs = useOpeningMotion(root, storedOpenDoorIds)
  const walkRefs = useWalkSession(
    props,
    { camera, domElement, floorElevationMm: collisionInputs.floorElevationMm },
    openingRefs,
  )

  useFrame((_state, delta) => {
    // The walk step, gated by walk mode, runs before the opening tick, which runs in both modes.
    if (enabled) stepWalkFrame({ camera, collisionInputs, ...walkRefs }, delta)
    tickOpeningMotion(root, openingRefs, delta)
  })

  return null
}
