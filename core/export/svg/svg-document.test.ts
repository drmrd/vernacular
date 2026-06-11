import { describe, expect, it } from 'vitest'
import type { Point } from '../../model/types'
import {
  escapeXmlAttribute,
  escapeXmlText,
  svgAttributes,
  svgDocument,
  svgGroup,
  svgLine,
  svgPolygon,
  svgPolyline,
  svgText,
} from './svg-document'

describe('pure SVG string builders', () => {
  it('escapes XML text special characters', () => {
    const result = escapeXmlText('Tom & "Jerry" <b>')

    expect(result).toContain('&amp;')
    expect(result).toContain('&lt;')
    expect(result).toContain('&gt;')
    expect(result).not.toMatch(/<|>/)
    // No raw, unescaped ampersand remains (every & must begin an entity).
    expect(result).not.toMatch(/&(?!amp;|lt;|gt;)/)
    // Quotes are left as-is in text content.
    expect(result).toContain('"Jerry"')
  })

  it('escapes attribute values including quotes', () => {
    const result = escapeXmlAttribute('a & "b" <c>')

    expect(result).toContain('&amp;')
    expect(result).toContain('&quot;')
    expect(result).toContain('&lt;')
    expect(result).toContain('&gt;')
  })

  it('serializes attributes deterministically in insertion order and rounds numbers', () => {
    expect(svgAttributes({ x1: 1.23456, y1: 2, stroke: '#222' })).toBe(
      ' x1="1.235" y1="2" stroke="#222"',
    )

    const withUndefined = svgAttributes({ a: 1, b: undefined, c: 3 })
    expect(withUndefined).not.toContain('b=')
  })

  it('emits a self-closing line element with its endpoints and attributes', () => {
    const result = svgLine({ x1: 0, y1: 0, x2: 10, y2: 5, attributes: { stroke: '#222' } })

    expect(result).toMatch(/^<line [^>]*\/>$/)
    expect(result).toContain('x1="0"')
    expect(result).toContain('y1="0"')
    expect(result).toContain('x2="10"')
    expect(result).toContain('y2="5"')
    expect(result).toContain('stroke="#222"')
  })

  it('emits a polygon with a points attribute from projected points', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]
    const result = svgPolygon(points, { fill: '#eef2f6' })

    expect(result).toContain('points="0,0 10,0 10,10"')
    expect(result).toContain('fill="#eef2f6"')
  })

  it('emits a polyline with a points attribute', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]
    const result = svgPolyline(points, { stroke: '#222' })

    expect(result).toContain('<polyline')
    expect(result).toContain('points="0,0 10,0"')
  })

  it('emits a text element with escaped content at a position', () => {
    const result = svgText('Kitchen & Bath', { x: 5, y: 6 })

    expect(result).toContain('x="5"')
    expect(result).toContain('y="6"')
    expect(result).toContain('>Kitchen &amp; Bath<')
  })

  it('wraps children in a group', () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- SVG data-* attribute keys are kebab-case by spec
    const result = svgGroup(['<line/>', '<line/>'], { 'data-node-id': 'wall:w1' })

    expect(result.startsWith('<g ')).toBe(true)
    expect(result).toContain('data-node-id="wall:w1"')
    expect(result).toContain('<line/>')
    expect(result.match(/<line\/>/g)).toHaveLength(2)
    expect(result.endsWith('</g>')).toBe(true)
  })

  it('wraps a body in a namespaced svg document with a viewBox', () => {
    const result = svgDocument({ width: 4200, height: 3200 }, '<g/>')

    expect(result).toContain('<svg')
    expect(result).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(result).toContain('viewBox="0 0 4200 3200"')
    expect(result).toContain('width="4200"')
    expect(result).toContain('height="3200"')
    expect(result).toContain('<g/>')
    expect(result.endsWith('</svg>')).toBe(true)
  })
})
