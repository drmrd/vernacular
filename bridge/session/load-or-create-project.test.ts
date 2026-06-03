import { describe, it, expect } from 'vitest'
import { loadOrCreateProject } from './load-or-create-project'
import { InMemoryProjectStore } from '../../storage'
import { createEmptyProject, type Project } from '../../core'

function fallback(): Project {
  return createEmptyProject({
    name: 'Fresh',
    units: 'imperial',
    era: 'modern',
    appVersion: '0.0.0',
  })
}

describe('loadOrCreateProject', () => {
  it('returns the fallback when nothing is stored', async () => {
    const store = new InMemoryProjectStore()

    const project = await loadOrCreateProject(store, 'current', fallback)

    expect(project.meta.name).toBe('Fresh')
  })

  it('returns the stored project when present', async () => {
    const store = new InMemoryProjectStore()
    const saved = createEmptyProject({
      name: 'Saved',
      units: 'metric',
      era: 'victorian',
      appVersion: '0.0.0',
    })
    await store.save('current', saved)

    const project = await loadOrCreateProject(store, 'current', fallback)

    expect(project.meta.name).toBe('Saved')
  })
})
