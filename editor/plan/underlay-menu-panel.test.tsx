import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  ActiveFloorProvider,
  EditorSessionProvider,
  createActiveFloorStore,
  createEditorSession,
} from '../../bridge'
import { createEmptyProject, createFloor } from '../../core'
import type { UnderlayContextValue } from './use-underlay'
import { UnderlayMenuPanel } from './underlay-menu-panel'

const loadImage = vi.fn()

vi.mock('./use-underlay', () => ({
  useUnderlay: (): UnderlayContextValue =>
    ({
      loadImage,
      startCalibration: vi.fn(),
      resolveDrawables: () => [],
    }) as unknown as UnderlayContextValue,
}))

afterEach(() => {
  cleanup()
  loadImage.mockReset()
})

function renderPanel() {
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
        <UnderlayMenuPanel />
      </ActiveFloorProvider>
    </EditorSessionProvider>,
  )
}

describe('UnderlayMenuPanel', () => {
  it('loads an underlay image from the menu launcher', async () => {
    const user = userEvent.setup()

    renderPanel()

    await user.click(screen.getByRole('button', { name: /underlay/i }))
    await user.click(screen.getByRole('menuitem', { name: /load image/i }))

    expect(loadImage).toHaveBeenCalledTimes(1)
  })
})
