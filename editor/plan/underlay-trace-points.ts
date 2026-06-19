import { rotatePoint, type Point, type SceneGraph, type UnderlaySceneNode } from '../../core'

/**
 * The four world-space corners of an underlay's footprint, in clockwise order
 * starting at the placement offset (the image's top-left pixel origin).
 *
 * The footprint spans `width * millimetersPerPixel` plan millimeters across +x
 * and `height * millimetersPerPixel` toward decreasing world-y (the image's
 * downward pixel axis maps to downward world-y), anchored at the placement
 * offset, with each corner rotated about that offset by the placement rotation.
 */
export function underlayTracePoints(underlay: UnderlaySceneNode): Point[] {
  const { offset, millimetersPerPixel, rotation } = underlay.placement
  const widthMm = underlay.width * millimetersPerPixel
  const heightMm = underlay.height * millimetersPerPixel
  const corners: Point[] = [
    { x: offset.x, y: offset.y },
    { x: offset.x + widthMm, y: offset.y },
    { x: offset.x + widthMm, y: offset.y - heightMm },
    { x: offset.x, y: offset.y - heightMm },
  ]
  return corners.map((corner) => rotatePoint(corner, offset, rotation))
}

/**
 * The visible underlays' footprint corners the wall tool can snap to in trace
 * mode, or undefined when trace mode is off so snapping is byte-for-byte
 * unchanged. Hidden underlays contribute no corners.
 */
export function floorUnderlayTracePoints(
  graph: SceneGraph,
  enabled: boolean,
): readonly Point[] | undefined {
  return enabled
    ? graph.underlays.filter((underlay) => underlay.visible).flatMap(underlayTracePoints)
    : undefined
}
