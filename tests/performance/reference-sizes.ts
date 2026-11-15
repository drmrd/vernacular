import { deriveRooms, type Floor, type Project } from '../../core'

/** The sizes of a project that the performance baseline records. */
export interface ProjectSizes {
  floors: number
  walls: number
  rooms: number
  openings: number
  stairs: number
  furniture: number
  paintedSurfaces: number
}

/** Counts the sizes of a project; rooms are the ones derived from the walls of each floor. */
export function measureProjectSizes(project: Project): ProjectSizes {
  const sumOverFloors = (count: (floor: Floor) => number): number =>
    project.floors.reduce((total, floor) => total + count(floor), 0)
  return {
    floors: project.floors.length,
    walls: sumOverFloors((floor) => floor.walls.length),
    rooms: sumOverFloors((floor) => deriveRooms(floor.walls).length),
    openings: sumOverFloors((floor) => floor.openings.length),
    stairs: project.stairs.length,
    furniture: sumOverFloors((floor) => floor.furniture.length),
    paintedSurfaces: Object.keys(project.paint ?? {}).length,
  }
}
