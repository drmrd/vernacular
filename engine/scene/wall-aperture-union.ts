import * as THREE from 'three'
import { pointInPolygon, segmentIntersection } from '../../core'
import type { Triangle } from './geometry-utils'

export type ElevationSegment = [THREE.Vector2, THREE.Vector2]

export function contourSegments(loop: THREE.Vector2[]): ElevationSegment[] {
  return loop.map((from, index) => [from, loop[(index + 1) % loop.length]!])
}

/** Containment and contour crossings also cover coincident and just-touching apertures. */
export function aperturesIntersect(first: THREE.Vector2[], second: THREE.Vector2[]): boolean {
  const firstBounds = new THREE.Box2().setFromPoints(first)
  const secondBounds = new THREE.Box2().setFromPoints(second)
  const secondEdges = contourSegments(second)
  return (
    firstBounds.intersectsBox(secondBounds) &&
    (pointInPolygon(first[0]!, second) ||
      pointInPolygon(second[0]!, first) ||
      contourSegments(first).some(([a, b]) =>
        secondEdges.some(([c, d]) => segmentIntersection(a, b, c, d) !== null),
      ))
  )
}

interface Level {
  left: number
  right: number
  winding: number
}

interface SolidBand {
  bottom: Level
  top: Level
}

function heightAt([a, b]: ElevationSegment, x: number): number {
  return a.y + (b.y - a.y) * ((x - a.x) / (b.x - a.x))
}

/** Between adjacent event columns, no two contour edges cross or change order. */
function solidBands(edges: ElevationSegment[], left: number, right: number): SolidBand[] {
  const middle = (left + right) / 2
  const levels = edges
    .filter(([a, b]) => Math.min(a.x, b.x) < middle && middle < Math.max(a.x, b.x))
    .map((edge) => ({
      left: heightAt(edge, left),
      right: heightAt(edge, right),
      winding: Math.sign(edge[1].x - edge[0].x),
    }))
    .sort((a, b) => a.left + a.right - (b.left + b.right))
  const bands: SolidBand[] = []
  let winding = 0
  for (const [index, bottom] of levels.slice(0, -1).entries()) {
    winding += bottom.winding
    const top = levels[index + 1]!
    if (winding > 0 && top.left + top.right > bottom.left + bottom.right)
      bands.push({ bottom, top })
  }
  return bands
}

type Interval = [number, number]

function verticalReveals(x: number, left: Interval[], right: Interval[]): ElevationSegment[] {
  const heights = [...new Set([...left.flat(), ...right.flat()])].sort((a, b) => a - b)
  const segments: ElevationSegment[] = []
  for (const [index, low] of heights.slice(0, -1).entries()) {
    const high = heights[index + 1]!
    const middle = (low + high) / 2
    const solidLeft = left.some(([a, b]) => a < middle && middle < b)
    const solidRight = right.some(([a, b]) => a < middle && middle < b)
    if (solidLeft === solidRight) continue
    const bottom = new THREE.Vector2(x, low)
    const top = new THREE.Vector2(x, high)
    segments.push(solidLeft ? [bottom, top] : [top, bottom])
  }
  return segments
}

function eventColumns(edges: ElevationSegment[]): number[] {
  const columns = new Set(edges.map(([point]) => point.x))
  for (const [index, [a, b]] of edges.entries()) {
    for (const [c, d] of edges.slice(index + 1)) {
      const crossing = segmentIntersection(a, b, c, d)
      if (crossing) columns.add(crossing.x)
    }
  }
  return [...columns].sort((a, b) => a - b)
}

/** The wall outline winds counterclockwise and each aperture clockwise. Positive winding is solid wall. */
export function wallOutsideApertures(outline: THREE.Vector2[], holes: THREE.Vector2[][]) {
  const edges = [outline, ...holes].flatMap(contourSegments)
  const columns = eventColumns(edges)
  const points: THREE.Vector2[] = []
  const triangles: Triangle[] = []
  const reveals: ElevationSegment[] = []
  let previous: Interval[] = []
  for (const [index, left] of columns.slice(0, -1).entries()) {
    const right = columns[index + 1]!
    const bands = solidBands(edges, left, right)
    reveals.push(
      ...verticalReveals(
        left,
        previous,
        bands.map(({ bottom, top }) => [bottom.left, top.left]),
      ),
    )
    previous = bands.map(({ bottom, top }) => [bottom.right, top.right])
    for (const { bottom, top } of bands) {
      const a = new THREE.Vector2(left, bottom.left)
      const b = new THREE.Vector2(right, bottom.right)
      const c = new THREE.Vector2(right, top.right)
      const d = new THREE.Vector2(left, top.left)
      const first = points.length
      const last = points.push(a, b, c, d) - 1
      if (top.right > bottom.right) triangles.push([first, first + 1, last - 1])
      if (top.left > bottom.left) triangles.push([first, last - 1, last])
      reveals.push([a, b], [c, d])
    }
  }
  return { points, triangles, reveals }
}
