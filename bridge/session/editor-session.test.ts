import { describe, it, expect } from 'vitest'
import { createEditorSession } from './editor-session'
import {
  addEnvironmentScene,
  addFloor,
  addWall,
  assignSurfacePaint,
  colorFromHex,
  createEmptyProject,
  resolveSurfacePaint,
  setSiteTimezone,
  solidTreatment,
  type EnvironmentScene,
  type Project,
} from '../../core'

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

  it('reports undo and redo availability across a dispatch and an undo', () => {
    const session = createEditorSession(emptyProject())

    expect(session.canUndo()).toBe(false)
    expect(session.canRedo()).toBe(false)

    session.dispatch(addFloor('Ground'))
    const floorId = session.getProject().floors[0]!.id
    session.dispatch(addWall(floorId, { x: 0, y: 0 }, { x: 500, y: 0 }))

    expect(session.canUndo()).toBe(true)
    expect(session.canRedo()).toBe(false)

    session.undo()

    expect(session.canUndo()).toBe(true)
    expect(session.canRedo()).toBe(true)
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

  it('applies a surface paint assignment dispatched through the session', () => {
    const session = createEditorSession(emptyProject())
    const ref = { kind: 'wall-face', wallId: 'w1', side: 'left' } as const

    session.dispatch(assignSurfacePaint(ref, colorFromHex('#9aa583'), 'matte'))

    const treatment = resolveSurfacePaint(session.getProject(), ref)
    expect(treatment).toEqual(solidTreatment(colorFromHex('#9aa583'), 'matte'))
  })
})

function newSession() {
  return createEditorSession(
    createEmptyProject({ name: 'H', units: 'metric', period: 'victorian', appVersion: '0.1.0' }),
  )
}

describe('createEditorSession command wiring', () => {
  it('dispatches a site command through the live registry', () => {
    const session = newSession()
    session.dispatch(setSiteTimezone('America/New_York'))
    expect(session.getProject().site?.timezone).toBe('America/New_York')
    session.undo()
    expect(session.getProject().site?.timezone).toBeUndefined()
  })

  it('dispatches an environment-scene command through the live registry', () => {
    const session = newSession()
    const scene: EnvironmentScene = { id: 's1', name: 'Noon', observedAt: '2026-06-21T12:00' }
    session.dispatch(addEnvironmentScene(scene))
    expect(session.getProject().environmentScenes).toEqual([scene])
  })
})
