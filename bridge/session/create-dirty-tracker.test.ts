import { describe, it, expect } from 'vitest'
import { createEditorSession } from './editor-session'
import { createDirtyTracker } from './create-dirty-tracker'
import { addFloor, createEmptyProject, type Project } from '../../core'

function emptyProject(): Project {
  return createEmptyProject({
    name: 'Test',
    units: 'metric',
    period: 'modern',
    appVersion: '0.0.0',
  })
}

describe('createDirtyTracker', () => {
  it('starts clean over a fresh session and flips dirty after a mutating dispatch', () => {
    const session = createEditorSession(emptyProject())
    const tracker = createDirtyTracker(session)

    expect(tracker.isDirty()).toBe(false)

    session.dispatch(addFloor('Ground'))

    expect(tracker.isDirty()).toBe(true)
  })

  it('clears on markSaved and goes dirty again on a subsequent change', () => {
    const session = createEditorSession(emptyProject())
    const tracker = createDirtyTracker(session)

    session.dispatch(addFloor('Ground'))
    expect(tracker.isDirty()).toBe(true)

    tracker.markSaved()
    expect(tracker.isDirty()).toBe(false)

    session.dispatch(addFloor('First'))
    expect(tracker.isDirty()).toBe(true)
  })
})
