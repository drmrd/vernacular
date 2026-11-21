import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { NotificationProvider } from '../editor/design-system'
import { createTestPorts } from '../session/handle/handle-test-kit'
import { addressFor } from './address'
import { createMemoryAddressBar } from './address-bar'
import { ProjectsScreen } from './projects-screen'
import { useHistoryNavigation } from './use-history-navigation'

const meta: Meta<typeof ProjectsScreen> = {
  title: 'App/ProjectsScreen',
  component: ProjectsScreen,
  // The screen reads the stored projects through the navigation of the application, so the story
  // mounts that navigation on in-memory ports. The '!test' tag keeps it out of the browser-mode
  // component-test run, as the stories of the whole application are.
  tags: ['!test'],
}

export default meta

type Story = StoryObj<typeof ProjectsScreen>

// Fresh in-memory ports and a memory address bar per mount keep the demo repeatable and leave the
// durable stores of the browser alone. useState builds them once so the navigation does not start
// again on each render.
function DemoScreen() {
  const [ports] = useState(() => createTestPorts())
  const [address] = useState(() => createMemoryAddressBar(addressFor({ kind: 'projects' })))
  const navigation = useHistoryNavigation(ports, address)
  const { screen } = navigation
  if (screen?.kind !== 'projects') {
    return null
  }
  return <ProjectsScreen navigation={navigation} screen={screen} ports={ports} />
}

export const Default: Story = {
  render: () => (
    <NotificationProvider>
      <DemoScreen />
    </NotificationProvider>
  ),
}
