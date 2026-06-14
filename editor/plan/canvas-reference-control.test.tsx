import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import {
  ActiveFloorProvider,
  EditorSessionProvider,
  createActiveFloorStore,
  createEditorSession,
} from '../../bridge'
import { createEmptyProject, createFloor } from '../../core'
import { CanvasReferenceControl } from './canvas-reference-control'

afterEach(cleanup)

function renderControl() {
  const project = createEmptyProject({
    name: 'T',
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0',
  })
  project.floors = [createFloor('G', { id: 'g' })]
  const session = createEditorSession(project)
  const activeFloor = createActiveFloorStore('g')
  render(
    <EditorSessionProvider session={session}>
      <ActiveFloorProvider store={activeFloor}>
        <CanvasReferenceControl />
      </ActiveFloorProvider>
    </EditorSessionProvider>,
  )
}

describe('CanvasReferenceControl', () => {
  it('renders a Load image control for the active floor underlay', () => {
    renderControl()
    expect(screen.getByRole('button', { name: /load image/i })).toBeInTheDocument()
  })
})
