import type { Opening, Project } from '../model/types'
import { isMarkedDoor } from '../registries/opening-kind'

/** The opening without its main entrance mark; the same object when it carries none. */
export function withoutEntranceMark(opening: Opening): Opening {
  if (!('entrance' in opening)) {
    return opening
  }
  const unmarked = { ...opening }
  delete unmarked.entrance
  return unmarked
}

/** How many doors carry the main entrance mark, across every floor. */
export function countMarkedDoors(project: Readonly<Project>): number {
  return project.floors.flatMap((floor) => floor.openings).filter(isMarkedDoor).length
}
