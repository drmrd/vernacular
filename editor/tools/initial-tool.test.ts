import { describe, it, expect } from 'vitest'
import { createEmptyProject, createFloor, createWall, type Project } from '../../core'
import { initialToolForProject } from './initial-tool'

function projectWithFloors(floors: Project['floors']): Project {
  return {
    ...createEmptyProject({
      name: 'Untitled',
      units: 'imperial',
      period: 'modern',
      appVersion: '0.0.0',
    }),
    floors,
  }
}

describe('initialToolForProject', () => {
  it('arms the wall tool for a fresh project with no walls on any floor', () => {
    const project = projectWithFloors([createFloor('Ground Floor')])

    expect(initialToolForProject(project)).toBe('draw-wall')
  })

  it('opens the select tool when a floor already has at least one wall', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 1000, y: 0 })
    const project = projectWithFloors([createFloor('Ground Floor', { walls: [wall] })])

    expect(initialToolForProject(project)).toBe('select')
  })
})
