import { describe, it, expect, vi } from 'vitest'
import type { ViewControls } from '../viewport/view-mode'
import { createSnapPreferencesStore } from '../plan/snap-preferences-store'
import { createCommandSet } from './command-set'

function buildDeps() {
  return {
    view: { mode: 'plan', setMode: vi.fn() } as unknown as ViewControls,
    snapStore: createSnapPreferencesStore(),
  }
}

describe('createCommandSet', () => {
  it('gathers the editing, view, and snap commands into one set', () => {
    const ids = createCommandSet(buildDeps()).map((command) => command.id)

    expect(ids).toContain('undo')
    expect(ids).toContain('delete-selection')
    expect(ids).toContain('show-plan')
    expect(ids).toContain('toggle-snapping')
  })

  it('offers Save only when the editor supplies a way to save', () => {
    const withoutSave = createCommandSet(buildDeps()).map((command) => command.id)
    expect(withoutSave).not.toContain('save')

    const withSave = createCommandSet({ ...buildDeps(), onSave: vi.fn() })
    expect(withSave.map((command) => command.id)).toContain('save')
  })

  it('gives every command a unique id, so one keystroke can never resolve twice', () => {
    const ids = createCommandSet({ ...buildDeps(), onSave: vi.fn() }).map((command) => command.id)

    expect(new Set(ids).size).toBe(ids.length)
  })
})
