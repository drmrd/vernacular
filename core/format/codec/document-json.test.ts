import { describe, expect, it } from 'vitest'
import { createEmptyProject, createFloor, createWall } from '../../index'
import type { Project } from '../../index'
import { parseDocumentJson, serializeDocumentJson } from './document-json'

function representativeProject(): Project {
  const wall = createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, { id: 'wall-1', thickness: 140 })
  const floor = createFloor('Ground floor', {
    id: 'floor-1',
    elevation: 0,
    walls: [wall],
  })
  const project = createEmptyProject({
    name: 'Sample House',
    units: 'metric',
    period: 'craftsman',
    appVersion: '0.1.0',
  })
  project.floors.push(floor)
  return project
}

describe('the JSON of a stored document', () => {
  it('round-trips a project with a floor and a wall through serialize then parse', () => {
    const project = representativeProject()

    const restored = parseDocumentJson(serializeDocumentJson(project))

    expect(restored).toEqual(project)
  })

  it('serializes pretty two-space JSON that starts at meta and ends with a trailing newline', () => {
    const project = representativeProject()

    const text = new TextDecoder().decode(serializeDocumentJson(project))

    expect(text.startsWith('{\n  "meta"')).toBe(true)
    expect(text.endsWith('\n')).toBe(true)
  })

  it('throws when parsing bytes that are not valid JSON', () => {
    const bytes = new TextEncoder().encode('not json')

    expect(() => parseDocumentJson(bytes)).toThrow()
  })
})
