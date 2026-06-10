import { describe, it, expect } from 'vitest'
import { createEditorSession } from './editor-session'
import { addFloor, addWall, createEmptyProject, type Project } from '../../core'

function emptyProject(): Project {
  return createEmptyProject({
    name: 'Test',
    units: 'metric',
    period: 'modern',
    appVersion: '0.0.0',
  })
}

describe('createEditorSession', () => {
  it('dispatches a command and reflects it in the derived scene graph', () => {
    const session = createEditorSession(emptyProject())

    expect(session.getSceneGraph().nodes).toHaveLength(0)
    session.dispatch(addFloor('Ground'))

    expect(session.getSceneGraph().nodes).toHaveLength(1)
    expect(session.getSceneGraph().nodes[0]?.name).toBe('Ground')
    expect(session.getProject().floors).toHaveLength(1)
  })

  it('undoes and redoes dispatched commands through the boundary', () => {
    const session = createEditorSession(emptyProject())
    session.dispatch(addFloor('Ground'))

    expect(session.undo()).toBe(true)
    expect(session.getSceneGraph().nodes).toHaveLength(0)
    expect(session.redo()).toBe(true)
    expect(session.getSceneGraph().nodes).toHaveLength(1)
    expect(session.undo()).toBe(true)
    expect(session.undo()).toBe(false)
  })
})

describe('createEditorSession subscription', () => {
  it('returns a stable scene graph reference until the next mutation', () => {
    const session = createEditorSession(emptyProject())

    const before = session.getSceneGraph()
    expect(session.getSceneGraph()).toBe(before)

    session.dispatch(addFloor('Ground'))
    expect(session.getSceneGraph()).not.toBe(before)
  })

  it('notifies subscribers on dispatch, undo, and redo, and stops after unsubscribe', () => {
    const session = createEditorSession(emptyProject())
    let notifications = 0
    const unsubscribe = session.subscribe(() => {
      notifications += 1
    })

    session.dispatch(addFloor('Ground'))
    session.undo()
    session.redo()
    expect(notifications).toBe(3)

    unsubscribe()
    session.dispatch(addFloor('Upper'))
    expect(notifications).toBe(3)
  })

  it('does not notify when undo or redo is a no-op', () => {
    const session = createEditorSession(emptyProject())
    let notifications = 0
    session.subscribe(() => {
      notifications += 1
    })

    expect(session.undo()).toBe(false)
    expect(session.redo()).toBe(false)
    expect(notifications).toBe(0)
  })

  it('dispatches wall commands through the boundary', () => {
    const session = createEditorSession(emptyProject())
    session.dispatch(addFloor('Ground'))
    const floorId = session.getProject().floors[0]!.id

    session.dispatch(addWall(floorId, { x: 0, y: 0 }, { x: 500, y: 0 }))

    expect(session.getSceneGraph().walls).toHaveLength(1)
  })
})
