import type { Point, RoomSceneNode } from '../../core'

function pointsEqual(a: readonly Point[] | undefined, b: readonly Point[] | undefined): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined || a.length !== b.length) return false
  return a.every((point, index) => {
    const other = b[index]
    return other !== undefined && point.x === other.x && point.y === other.y
  })
}

function ringsEqual(a: readonly Point[][] | undefined, b: readonly Point[][] | undefined): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined || a.length !== b.length) return false
  return a.every((ring, index) => pointsEqual(ring, b[index]))
}

export function roomSceneNodeEqual(a: RoomSceneNode, b: RoomSceneNode): boolean {
  return (
    a.id === b.id &&
    a.area === b.area &&
    a.name === b.name &&
    a.ceilingHeight === b.ceilingHeight &&
    pointsEqual(a.polygon, b.polygon) &&
    pointsEqual(a.clearPolygon, b.clearPolygon) &&
    pointsEqual(a.outerPolygon, b.outerPolygon) &&
    ringsEqual(a.holes, b.holes)
  )
}
