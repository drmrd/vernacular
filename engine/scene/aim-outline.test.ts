import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { AIM_OUTLINE_COLOR, createAimOutlineGroup, reconcileAimOutline } from '../index'
import type { OpeningAimOutline } from '../../core'

const DOOR_OUTLINE: OpeningAimOutline = [
  { x: 550, y: 0, z: -2000 },
  { x: 1450, y: 0, z: -2000 },
  { x: 1450, y: 2032, z: -2000 },
  { x: 550, y: 2032, z: -2000 },
]

const DOOR_OUTLINE_NUMBERS = [
  550, 0, -2000, 1450, 0, -2000, 1450, 2032, -2000, 550, 2032, -2000, 550, 0, -2000,
]

const RAISE_MM = 3000

function raised(outline: OpeningAimOutline, byMm: number): OpeningAimOutline {
  const [a, b, c, d] = outline
  return [
    { ...a, y: a.y + byMm },
    { ...b, y: b.y + byMm },
    { ...c, y: c.y + byMm },
    { ...d, y: d.y + byMm },
  ]
}

function lineOf(group: THREE.Group): THREE.Line {
  const line = group.children[0]
  if (!(line instanceof THREE.Line)) throw new Error('expected the first child to be a line')
  return line
}

function positionNumbers(group: THREE.Group): number[] {
  return Array.from(lineOf(group).geometry.getAttribute('position').array)
}

describe('createAimOutlineGroup', () => {
  it('starts empty under its own name', () => {
    const group = createAimOutlineGroup()

    expect(group.name).toBe('aim-outline')
    expect(group.children).toHaveLength(0)
  })
})

describe('reconcileAimOutline', () => {
  it('draws one closed line through the four corners', () => {
    const group = createAimOutlineGroup()

    reconcileAimOutline(group, DOOR_OUTLINE)

    expect(group.children).toHaveLength(1)
    expect(lineOf(group).geometry.getAttribute('position').count).toBe(5)
    expect(positionNumbers(group)).toEqual(DOOR_OUTLINE_NUMBERS)
  })

  it('draws over the scene in its own color', () => {
    const group = createAimOutlineGroup()

    reconcileAimOutline(group, DOOR_OUTLINE)

    const line = lineOf(group)
    expect(line.material).toBeInstanceOf(THREE.LineBasicMaterial)
    const material = line.material as THREE.LineBasicMaterial
    expect(material.color.getHex()).toBe(AIM_OUTLINE_COLOR)
    expect(AIM_OUTLINE_COLOR).not.toBe(0xffffff)
    expect(material.depthTest).toBe(false)
    expect(line.renderOrder).toBe(2)
    expect(line.frustumCulled).toBe(false)
  })

  it('moves the same line when the corners change', () => {
    const group = createAimOutlineGroup()
    reconcileAimOutline(group, DOOR_OUTLINE)
    const line = lineOf(group)
    const disposeGeometry = vi.spyOn(line.geometry, 'dispose')

    reconcileAimOutline(group, raised(DOOR_OUTLINE, RAISE_MM))

    expect(group.children[0]).toBe(line)
    expect(group.children).toHaveLength(1)
    expect(positionNumbers(group)).toEqual([
      550,
      RAISE_MM,
      -2000,
      1450,
      RAISE_MM,
      -2000,
      1450,
      2032 + RAISE_MM,
      -2000,
      550,
      2032 + RAISE_MM,
      -2000,
      550,
      RAISE_MM,
      -2000,
    ])
    expect(disposeGeometry).not.toHaveBeenCalled()
  })

  it('clears and frees the line when nothing is in reach', () => {
    const group = createAimOutlineGroup()
    reconcileAimOutline(group, DOOR_OUTLINE)
    const line = lineOf(group)
    const disposeGeometry = vi.spyOn(line.geometry, 'dispose')
    const disposeMaterial = vi.spyOn(line.material as THREE.Material, 'dispose')

    reconcileAimOutline(group, null)

    expect(group.children).toHaveLength(0)
    expect(disposeGeometry).toHaveBeenCalledTimes(1)
    expect(disposeMaterial).toHaveBeenCalledTimes(1)
  })

  it('stays empty for null on an empty group', () => {
    const group = createAimOutlineGroup()

    reconcileAimOutline(group, null)

    expect(group.children).toHaveLength(0)
  })

  it('draws again after a clear', () => {
    const group = createAimOutlineGroup()
    reconcileAimOutline(group, DOOR_OUTLINE)
    reconcileAimOutline(group, null)

    reconcileAimOutline(group, DOOR_OUTLINE)

    expect(group.children).toHaveLength(1)
  })
})
