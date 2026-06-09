import type { Floor, Project } from '../../model/types'

// Applies `update` to the floor whose id matches `floorId`, leaving all other floors
// reference-equal. Reassigns state.floors so the inverse-capture proxy (ADR-0005) records
// the slice replacement and the dispatcher can capture the inverse for undo.
export function mapTargetFloor(
  state: Project,
  floorId: string,
  update: (floor: Floor) => Floor,
): void {
  state.floors = state.floors.map((floor) => (floor.id === floorId ? update(floor) : floor))
}
