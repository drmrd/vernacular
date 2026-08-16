import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UserEvent } from '@testing-library/user-event'
import type { ReactNode } from 'react'

import {
  AssetRegistry,
  InMemoryAssetCache,
  UserSource,
  type LibraryItem,
  type UserLibraryIndex,
} from '../../storage'
import { AssetRegistryProvider } from '../../bridge/react/asset-registry-context'
import { UserAssetSourceProvider } from '../../bridge/react/user-asset-source-context'
import { NotificationProvider, ToastRegion } from '../design-system'
import { ActiveToolContext, type ToolId } from '../tools/active-tool-context'

import { LibraryLauncherPanel } from './library-launcher-panel'

const GLB_BYTES = Uint8Array.of(0x67, 0x6c, 0x54, 0x46, 1, 0, 0, 0, 9, 9, 9)
const ZIP_BYTES = Uint8Array.of(0x50, 0x4b, 3, 4)
const IMPORT_ACTION = /import a 3d model/i
const IMPORTED_NAME = 'Mid Century Chair'

function makeUserSource(): UserSource {
  const items: LibraryItem[] = []
  const index: UserLibraryIndex = {
    list: async () => items.slice(),
    add: async (item: LibraryItem) => {
      items.push(item)
    },
  }
  return new UserSource(new InMemoryAssetCache(), index)
}

interface HarnessOptions {
  source?: UserSource | null
  registry?: AssetRegistry
  tool?: ToolId
}

function withUserSource(source: UserSource | null, panel: ReactNode): ReactNode {
  return source === null ? (
    panel
  ) : (
    <UserAssetSourceProvider source={source}>{panel}</UserAssetSourceProvider>
  )
}

function renderConnectedPanel(options: HarnessOptions = {}): void {
  const { source = null, registry = new AssetRegistry([]), tool = 'place-furniture' } = options
  const panel = (
    <AssetRegistryProvider registry={registry}>
      <ActiveToolContext.Provider value={{ tool, setTool: vi.fn() }}>
        <LibraryLauncherPanel />
      </ActiveToolContext.Provider>
    </AssetRegistryProvider>
  )
  render(
    <NotificationProvider>
      {withUserSource(source, panel)}
      <ToastRegion />
    </NotificationProvider>,
  )
}

async function openPanel(user: UserEvent): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Furniture' }))
}

function fileInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')
  if (input === null) {
    throw new Error('the launcher panel rendered no file input')
  }
  return input
}

afterEach(cleanup)

describe('LibraryLauncherPanel import feedback', () => {
  it('announces a successful import and lists the new item without reopening the panel', async () => {
    const user = userEvent.setup()
    const source = makeUserSource()
    renderConnectedPanel({ source, registry: new AssetRegistry([{ kind: 'user', source }]) })
    await openPanel(user)

    await user.upload(fileInput(), new File([GLB_BYTES], `${IMPORTED_NAME}.glb`))

    expect(await screen.findByText(`Imported ${IMPORTED_NAME}`)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: IMPORTED_NAME })).toBeInTheDocument()
  })

  it('reports a rejected file as an error toast instead of an unhandled rejection', async () => {
    const user = userEvent.setup()
    renderConnectedPanel({ source: makeUserSource() })
    await openPanel(user)

    await user.upload(fileInput(), new File([ZIP_BYTES], 'holiday-photos.glb'))

    expect(await screen.findByRole('alert')).toHaveTextContent(/import failed/i)
  })

  it('disables the import action while no user asset source is available', async () => {
    const user = userEvent.setup()
    renderConnectedPanel()
    await openPanel(user)

    expect(screen.getByRole('button', { name: IMPORT_ACTION })).toBeDisabled()
  })

  it('enables the import action once a user asset source is available', async () => {
    const user = userEvent.setup()
    renderConnectedPanel({ source: makeUserSource() })
    await openPanel(user)

    expect(screen.getByRole('button', { name: IMPORT_ACTION })).toBeEnabled()
  })
})
