import { describe, it, expect } from 'vitest'
import { createEditorSession } from './editor-session'
import { addFloor, createEmptyProject, type Project } from '../../core'

function emptyProject(): Project {
  return createEmptyProject({ name: 'Test', units: 'metric', era: 'modern', appVersion: '0.0.0' })
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
