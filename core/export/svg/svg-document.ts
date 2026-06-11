import type { Point } from '../../model/types'

/** Decimal places coordinates and numeric attribute values are rounded to. */
const COORDINATE_PRECISION = 3

/** Round a coordinate to a fixed precision, stripping trailing zeros. */
function roundCoordinate(value: number): number {
  return Number(value.toFixed(COORDINATE_PRECISION))
}

/** An ordered replacement applied left to right while escaping. */
interface Replacement {
  from: string
  to: string
}

/** Apply an ordered list of literal replacements to a string. */
function escapeWith(value: string, replacements: readonly Replacement[]): string {
  return replacements.reduce((escaped, { from, to }) => escaped.split(from).join(to), value)
}

const TEXT_REPLACEMENTS: readonly Replacement[] = [
  { from: '&', to: '&amp;' },
  { from: '<', to: '&lt;' },
  { from: '>', to: '&gt;' },
]

const ATTRIBUTE_REPLACEMENTS: readonly Replacement[] = [
  ...TEXT_REPLACEMENTS,
  { from: '"', to: '&quot;' },
]

/** Escape a string for use as XML element text content (& < >). */
export function escapeXmlText(value: string): string {
  return escapeWith(value, TEXT_REPLACEMENTS)
}

/** Escape a string for use inside a double-quoted XML attribute (& < > "). */
export function escapeXmlAttribute(value: string): string {
  return escapeWith(value, ATTRIBUTE_REPLACEMENTS)
}

/** Serialize one attribute value to its escaped string form. */
function serializeAttributeValue(value: string | number): string {
  const text = typeof value === 'number' ? String(roundCoordinate(value)) : value
  return escapeXmlAttribute(text)
}

/**
 * Serialize attributes to a deterministic, space-prefixed attribute string in
 * insertion order. Numbers are rounded to a fixed precision; undefined values
 * are omitted.
 */
export function svgAttributes(attributes: Record<string, string | number | undefined>): string {
  return Object.entries(attributes)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([key, value]) => ` ${key}="${serializeAttributeValue(value)}"`)
    .join('')
}

/** A self-closing element: `<tag .../>`. */
export function svgElement(
  tag: string,
  attributes: Record<string, string | number | undefined>,
): string {
  return `<${tag}${svgAttributes(attributes)}/>`
}

/** Emit a line segment. Endpoint coordinates must already be in SVG space (projected). */
export function svgLine(line: {
  x1: number
  y1: number
  x2: number
  y2: number
  attributes?: Record<string, string | number | undefined>
}): string {
  return svgElement('line', {
    x1: line.x1,
    y1: line.y1,
    x2: line.x2,
    y2: line.y2,
    ...line.attributes,
  })
}

/** Serialize projected points to a `x,y x,y ...` attribute value. */
function serializePoints(points: readonly Point[]): string {
  return points.map((point) => `${roundCoordinate(point.x)},${roundCoordinate(point.y)}`).join(' ')
}

/** Emit a closed polygon. Points must already be in SVG space (projected). */
export function svgPolygon(
  points: readonly Point[],
  attributes?: Record<string, string | number | undefined>,
): string {
  return svgElement('polygon', { points: serializePoints(points), ...attributes })
}

/** Emit an open polyline. Points must already be in SVG space (projected). */
export function svgPolyline(
  points: readonly Point[],
  attributes?: Record<string, string | number | undefined>,
): string {
  return svgElement('polyline', { points: serializePoints(points), ...attributes })
}

export function svgText(
  text: string,
  position: Point,
  attributes?: Record<string, string | number | undefined>,
): string {
  const openingTag = `<text${svgAttributes({ x: position.x, y: position.y, ...attributes })}>`
  return `${openingTag}${escapeXmlText(text)}</text>`
}

/** A group wrapping pre-rendered child fragments. */
export function svgGroup(
  children: readonly string[],
  attributes?: Record<string, string | number | undefined>,
): string {
  return `<g${svgAttributes(attributes ?? {})}>${children.join('')}</g>`
}

/** The full document envelope with namespace, viewBox '0 0 w h', and width/height. */
export function svgDocument(view: { width: number; height: number }, body: string): string {
  const width = roundCoordinate(view.width)
  const height = roundCoordinate(view.height)
  const attributes = svgAttributes({
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
  })
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg${attributes}>${body}</svg>`
}
