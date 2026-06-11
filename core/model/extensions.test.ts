import { describe, it, expect } from 'vitest'
import type { Extensions, Project, Wall } from './types'

// Extension keys are reverse-DNS namespaces (spec section 6.3), which are not
// camelCase by design. The naming-convention rule is scoped off for these
// intentionally-namespaced literal keys.
/* eslint-disable @typescript-eslint/naming-convention */

describe('Extensions seam', () => {
  it('keys an Extensions value by reverse-DNS namespace and carries arbitrary payloads', () => {
    const extensions: Extensions = {
      'com.example.solar': { panelKilowatts: 6.4 },
      'org.example.survey': { instrument: 'total-station' },
    }
    expect(Object.keys(extensions)).toContain('com.example.solar')
    expect(extensions['com.example.solar']).toEqual({ panelKilowatts: 6.4 })
  })

  it('attaches an optional extensions member to a Wall that round-trips', () => {
    const wall: Wall = {
      id: 'wall-1',
      start: { x: 0, y: 0 },
      end: { x: 1000, y: 0 },
      thickness: 100,
      extensions: {
        'com.example.solar': { panelKilowatts: 6.4 },
      },
    }
    expect(wall.extensions).toBeDefined()
    expect(wall.extensions?.['com.example.solar']).toEqual({ panelKilowatts: 6.4 })
  })

  it('omits extensions on a Wall that does not declare any', () => {
    const wall: Wall = {
      id: 'wall-2',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1000 },
      thickness: 100,
    }
    expect(wall.extensions).toBeUndefined()
  })

  it('lets a Project carry an extensions member', () => {
    const project: Project = {
      meta: {
        name: 'Maple Street',
        units: 'metric',
        period: 'victorian',
        schemaVersion: 8,
        appVersion: '0.2.0',
        registryVersions: {},
      },
      floors: [],
      stairs: [],
      extensions: {
        'org.example.survey': { instrument: 'total-station' },
      },
    }
    expect(project.extensions).toBeDefined()
    expect(project.extensions?.['org.example.survey']).toEqual({ instrument: 'total-station' })
  })
})

/* eslint-enable @typescript-eslint/naming-convention */
