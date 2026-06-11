import type { PeriodId, Project } from '../model/types'

/**
 * The effective period of a floor or room:
 * room.periodOverride ?? floor.periodOverride ?? project.period. The effective
 * period is never stored; it is computed from the explicit value at each level.
 * An unknown floor or room key falls through to the next available level.
 */
export function resolvePeriod(project: Project, floorId: string, roomKey?: string): PeriodId {
  const roomPeriod =
    roomKey === undefined ? undefined : project.roomOverrides?.[roomKey]?.periodOverride
  const floorPeriod = project.floors.find((floor) => floor.id === floorId)?.periodOverride
  return roomPeriod ?? floorPeriod ?? project.meta.period
}
