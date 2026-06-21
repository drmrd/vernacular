import { useMemo, type ReactElement } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { within, expect, userEvent } from 'storybook/test'
import {
  EditorSessionProvider,
  ActiveFloorProvider,
  createEditorSession,
  createActiveFloorStore,
} from '../../bridge'
import { createEmptyProject, createFloor, createUnderlay, type AssetReference } from '../../core'
import { UnderlayMenuPanel } from './underlay-menu-panel'

const meta: Meta<typeof UnderlayMenuPanel> = {
  title: 'Editor/UnderlayMenuPanel',
  component: UnderlayMenuPanel,
  tags: ['autodocs'],
}

export default meta

type Story = StoryObj<typeof UnderlayMenuPanel>

const FLOOR_ID = 'ground'
const IMAGE: AssetReference = { scope: 'project', contentHash: 'deadbeef' }

// Mirrors underlay-menu-panel.test.tsx renderPanel: a one-floor session fed
// through the editor-session and active-floor providers. The connected panel
// resolves the underlay context from its in-tree fallback (the real editor wires
// the loader and calibration), so the flyout actions render without a live scene.
function UnderlayMenuPanelHarness({ withUnderlay }: { withUnderlay?: boolean }): ReactElement {
  const session = useMemo(() => {
    const floor = createFloor('Ground', { id: FLOOR_ID })
    if (withUnderlay) {
      floor.underlays = [createUnderlay({ image: IMAGE, width: 1024, height: 768 })]
    }
    const project = createEmptyProject({
      name: 'Sample plan',
      units: 'imperial',
      period: 'modern',
      appVersion: '0.0.0',
    })
    project.floors = [floor]
    return createEditorSession(project)
  }, [withUnderlay])
  const activeFloor = useMemo(() => createActiveFloorStore(FLOOR_ID), [])

  return (
    <EditorSessionProvider session={session}>
      <ActiveFloorProvider store={activeFloor}>
        <UnderlayMenuPanel />
      </ActiveFloorProvider>
    </EditorSessionProvider>
  )
}

export const Empty: Story = {
  render: () => <UnderlayMenuPanelHarness />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)

    // The launcher is collapsed until it is opened.
    const launcher = screen.getByRole('button', { name: /underlay/i })
    await expect(launcher).toHaveAttribute('aria-expanded', 'false')

    // Opening it reveals the Load image action and no underlay rows yet.
    await userEvent.click(launcher)
    await expect(launcher).toHaveAttribute('aria-expanded', 'true')
    await expect(screen.getByRole('menuitem', { name: /load image/i })).toBeInTheDocument()
    await expect(screen.queryByRole('button', { name: /calibrate/i })).not.toBeInTheDocument()
  },
}

export const WithUnderlay: Story = {
  render: () => <UnderlayMenuPanelHarness withUnderlay />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement)

    // Opening the flyout lists the loaded underlay alongside its controls.
    await userEvent.click(screen.getByRole('button', { name: /underlay/i }))
    await expect(screen.getByText('Underlay 1')).toBeInTheDocument()
    await expect(screen.getByLabelText(/opacity/i)).toBeInTheDocument()
    await expect(screen.getByRole('button', { name: /calibrate/i })).toBeInTheDocument()
  },
}
