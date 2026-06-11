import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EditorSessionProvider } from './editor-session-provider'
import { useEditorSession } from './editor-session-context'
import { createEditorSession } from '../session/editor-session'
import { createEmptyProject } from '../../core'

function Probe() {
  const session = useEditorSession()
  return <output>{session.getProject().meta.name}</output>
}

describe('useEditorSession', () => {
  it('returns the session provided by EditorSessionProvider', () => {
    const session = createEditorSession(
      createEmptyProject({
        name: 'Provided',
        units: 'metric',
        period: 'modern',
        appVersion: '0.0.0',
      }),
    )

    render(
      <EditorSessionProvider session={session}>
        <Probe />
      </EditorSessionProvider>,
    )

    expect(screen.getByText('Provided')).toBeInTheDocument()
  })

  it('throws when used outside an EditorSessionProvider', () => {
    expect(() => render(<Probe />)).toThrow(/EditorSessionProvider/)
  })
})
