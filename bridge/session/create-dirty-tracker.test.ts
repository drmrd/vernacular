import { describe, it, expect, vi } from 'vitest'
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

  it('notifies subscribers on both the clean-to-dirty and dirty-to-clean transitions', () => {
    const session = createEditorSession(emptyProject())
    const tracker = createDirtyTracker(session)
    const listener = vi.fn()

    tracker.subscribe(listener)

    session.dispatch(addFloor('Ground'))
    expect(tracker.isDirty()).toBe(true)
    const callsAfterDirtying = listener.mock.calls.length
    expect(callsAfterDirtying).toBeGreaterThanOrEqual(1)

    tracker.markSaved()
    expect(tracker.isDirty()).toBe(false)
    expect(listener.mock.calls.length).toBeGreaterThan(callsAfterDirtying)
  })

  it('reports revision 0 on a fresh tracker and increments by one per mutating dispatch', () => {
    const session = createEditorSession(emptyProject())
    const tracker = createDirtyTracker(session)

    expect(tracker.revision()).toBe(0)

    session.dispatch(addFloor('Ground'))
    expect(tracker.revision()).toBe(1)

    session.dispatch(addFloor('First'))
    expect(tracker.revision()).toBe(2)
  })

  it('clears dirtiness when markSavedRevision is given the current revision', () => {
    const session = createEditorSession(emptyProject())
    const tracker = createDirtyTracker(session)

    session.dispatch(addFloor('Ground'))
    expect(tracker.isDirty()).toBe(true)

    tracker.markSavedRevision(tracker.revision())

    expect(tracker.isDirty()).toBe(false)
  })

  it('stays dirty when a newer change arrives after the revision captured for saving', () => {
    const session = createEditorSession(emptyProject())
    const tracker = createDirtyTracker(session)

    session.dispatch(addFloor('Ground'))
    const rev = tracker.revision()

    session.dispatch(addFloor('First'))
    tracker.markSavedRevision(rev)

    expect(tracker.isDirty()).toBe(true)
  })

  it('does not re-dirty or lower the baseline when markSavedRevision is given an older revision', () => {
    const session = createEditorSession(emptyProject())
    const tracker = createDirtyTracker(session)

    session.dispatch(addFloor('Ground'))
    const olderRev = tracker.revision()

    session.dispatch(addFloor('First'))
    const currentRev = tracker.revision()

    tracker.markSavedRevision(currentRev)
    expect(tracker.isDirty()).toBe(false)

    tracker.markSavedRevision(olderRev)
    expect(tracker.isDirty()).toBe(false)

    session.dispatch(addFloor('Second'))
    tracker.markSavedRevision(tracker.revision())
    expect(tracker.isDirty()).toBe(false)
  })

  it('treats markSaved as marking the current revision saved', () => {
    const session = createEditorSession(emptyProject())
    const tracker = createDirtyTracker(session)

    session.dispatch(addFloor('Ground'))
    expect(tracker.isDirty()).toBe(true)

    tracker.markSaved()

    expect(tracker.isDirty()).toBe(false)
  })
})
