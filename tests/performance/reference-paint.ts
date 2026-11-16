import {
  CommandRegistry,
  Dispatcher,
  assignSurfacePaint,
  colorFromHex,
  registerPaintCommands,
  type Floor,
  type Project,
  type SurfaceRef,
} from '../../core'

/** A fixed period palette, cycled through the painted surfaces in order. */
const PAINT_HEXES = ['#e8dcc4', '#8a9a7b', '#6b4f3a', '#c9b79c'] as const

function paintHex(index: number): string {
  return PAINT_HEXES[index % PAINT_HEXES.length] as string
}

/** The floor, the ceiling, and the left face of every wall of one floor. */
function paintedSurfaces(floor: Floor): SurfaceRef[] {
  const wallFaces = floor.walls.map(
    (wall): SurfaceRef => ({ kind: 'wall-face', wallId: wall.id, side: 'left' }),
  )
  return [
    { kind: 'floor', floorId: floor.id },
    { kind: 'ceiling', floorId: floor.id },
    ...wallFaces,
  ]
}

/** Paints the reference surfaces through the real paint commands. */
export function paintReferenceSurfaces(project: Project): void {
  const dispatcher = new Dispatcher(project, registerPaintCommands(new CommandRegistry<Project>()))
  project.floors.flatMap(paintedSurfaces).forEach((surface, index) => {
    dispatcher.dispatch(assignSurfacePaint(surface, colorFromHex(paintHex(index))))
  })
}
