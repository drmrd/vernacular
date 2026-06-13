import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, type RefObject } from 'react'
import {
  advanceWalk,
  walkLookTarget,
  WALK_EYE_HEIGHT_MM,
  type WalkInput,
  type WalkState,
} from '../../core'

const LOOK_SENSITIVITY_RAD_PER_PX = 0.0025

// Maps a keyboard code to the movement flag it drives. A Map keeps the lookup result
// `... | undefined`, so an unmapped key (anything but WASD) is ignored cleanly.
const MOVEMENT_KEYS = new Map<string, 'forward' | 'back' | 'left' | 'right'>([
  ['KeyW', 'forward'],
  ['KeyS', 'back'],
  ['KeyA', 'left'],
  ['KeyD', 'right'],
])

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
  onUserControl: () => void
}

// Seeds the walk state, takes control of the camera, and wires the keyboard,
// click-to-capture, and pointer-look listeners. Movement keys act independently of
// pointer capture; the pointer only drives look while captured. Returns a teardown
// that removes the listeners, releases capture, and clears held input.
function startWalk({ camera, domElement, state, input, onUserControl }: WalkSession): () => void {
  state.current = seedWalkState(camera)
  // Mark user-controlled immediately so FrameCamera stops reapplying the framed pose
  // and the walk controller owns the camera from the first frame.
  onUserControl()
  const onKeyDown = (event: KeyboardEvent) => {
    const flag = MOVEMENT_KEYS.get(event.code)
    if (flag === undefined) return
    input.current[flag] = true
    onUserControl()
  }
  const onKeyUp = (event: KeyboardEvent) => {
    const flag = MOVEMENT_KEYS.get(event.code)
    if (flag !== undefined) input.current[flag] = false
  }
  const onClick = () => void domElement.requestPointerLock()
  const onPointerMove = (event: PointerEvent) => {
    if (document.pointerLockElement !== domElement) return
    input.current.yawDelta -= event.movementX * LOOK_SENSITIVITY_RAD_PER_PX
    input.current.pitchDelta -= event.movementY * LOOK_SENSITIVITY_RAD_PER_PX
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

interface WalkCameraControlsProps {
  enabled: boolean
  onUserControl: () => void
}

/**
 * Hand-rolled first-person walk: WASD movement (active whenever walk mode is on,
 * independent of pointer capture) plus pointer-lock mouse-look. It reads the pure
 * walk math from core and applies the result to the live camera each frame, so this
 * file holds no Three.js import. Entering walk mode seeds the camera at eye height
 * and takes control of it. This is rendering glue that only runs under a real WebGPU
 * canvas (foundation 6.3); its behavior is proven by the scene-webgl navigation e2e.
 */
export function WalkCameraControls({ enabled, onUserControl }: WalkCameraControlsProps) {
  const camera = useThree((state) => state.camera)
  const domElement = useThree((state) => state.gl.domElement)
  const stateRef = useRef<WalkState>({
    position: { x: 0, y: WALK_EYE_HEIGHT_MM, z: 0 },
    yaw: 0,
    pitch: 0,
  })
  const inputRef = useRef<WalkInput>(emptyWalkInput())

  useEffect(() => {
    if (!enabled) return
    return startWalk({
      camera,
      domElement,
      state: stateRef,
      input: inputRef,
      onUserControl,
    })
  }, [enabled, camera, domElement, onUserControl])

  useFrame((_state, delta) => {
    if (!enabled) return
    const next = advanceWalk(stateRef.current, inputRef.current, delta)
    inputRef.current.yawDelta = 0
    inputRef.current.pitchDelta = 0
    stateRef.current = next
    camera.position.set(next.position.x, next.position.y, next.position.z)
    const look = walkLookTarget(next)
    camera.lookAt(look.x, look.y, look.z)
  })

  return null
}
