import type { CameraPose, Vector3 } from '../../core'

/**
 * The camera the canvas opens on: the position the viewer left behind when the session
 * holds one, otherwise the framed scene's own pose. The near and far planes always come
 * from the pose, because they follow the size of the model rather than the vantage the
 * viewer chose. The tuple annotation is what React Three Fiber's camera prop expects; an
 * inferred number[] would not satisfy it.
 */
export function initialCamera(
  pose: CameraPose,
  savedPosition: Vector3 | null,
): { position: [number, number, number]; near: number; far: number } {
  const position = savedPosition ?? pose.position
  return {
    position: [position.x, position.y, position.z] as [number, number, number],
    near: pose.near,
    far: pose.far,
  }
}

/**
 * A plain copy of where a live camera currently sits. The parameter is structural so a
 * three camera satisfies it without this bridge file importing three (rules.md rule 1),
 * and the copy keeps the session from holding a vector the render loop goes on mutating.
 */
export function cameraPositionOf(camera: {
  position: { x: number; y: number; z: number }
}): Vector3 {
  return { x: camera.position.x, y: camera.position.y, z: camera.position.z }
}
