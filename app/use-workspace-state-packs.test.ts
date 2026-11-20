import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act, cleanup, waitFor } from '@testing-library/react'
import type { AssetReference } from '../core'
import { NotificationProvider, useNotifications } from '../editor/design-system'
import type { DocumentHandle, FlowResult } from '../session'
import { createTestPorts, type TestPorts } from '../session/handle/handle-test-kit'
import type { LibraryItem } from '../storage'
import {
  closeOpenedHandles,
  furnitureItem,
  openStoredProject,
  projectFileReferring,
  settleTheAction,
  shownWarnings,
} from './action-test-support'
import { workspaceProps } from './app-test-support'
import type { RunFlow } from './use-open-project'
import { useWorkspaceState } from './use-workspace-state'

/** What the library of the application lists now. A case sets it before it renders. */
const library = vi.hoisted(() => ({ items: [] as LibraryItem[] }))

vi.mock('./create-asset-library-registry', async () => {
  const { AssetRegistry, InMemoryAssetCache, UserSource } = await import('../storage')
  const userIndex = { list: () => Promise.resolve([]), add: () => Promise.resolve() }
  const packSource = {
    id: 'pack',
    read: () => Promise.resolve(undefined),
    list: () => Promise.resolve(library.items),
  }
  return {
    createAssetLibrary: () => ({
      registry: new AssetRegistry([{ kind: 'pack', source: packSource }]),
      userSource: new UserSource(new InMemoryAssetCache(), userIndex),
    }),
  }
})

const CURRENT_ID = 'current'
const ONE_MISSING_SENTENCE =
  'The file did not include 1 of the assets this project uses. It shows as missing.'
const PACK_REFERENCE: AssetReference = {
  scope: 'pack:vernacular-starter@1.0.0',
  contentHash: 'd'.repeat(64),
}

/** Every handle that an import opened, closed after the case. */
const importedHandles: DocumentHandle[] = []

afterEach(async () => {
  cleanup()
  await closeOpenedHandles()
  await act(async () => {
    await Promise.all(importedHandles.splice(0).map((handle) => handle.close()))
  })
  library.items = []
})

/** An owner that hands every flow the ports and `current`, and keeps what each flow gives. */
function ownerOf(ports: TestPorts, current: DocumentHandle) {
  const results: FlowResult<unknown>[] = []
  const runFlow: RunFlow = async (flow) => {
    const result = await flow(ports, current)
    results.push(result)
    if (result.ok) importedHandles.push(result.handle)
    return result
  }
  return { runFlow, results }
}

/** The workspace state of an open project, with the warnings that show beside it. */
async function renderWorkspaceOnAProject() {
  const ports = createTestPorts()
  const handle = await openStoredProject(ports, CURRENT_ID, 'Drafthouse')
  const owner = ownerOf(ports, handle)
  const props = workspaceProps(handle, { runFlow: owner.runFlow })
  const { result } = renderHook(
    () => ({ state: useWorkspaceState(props), shown: useNotifications().notifications }),
    { wrapper: NotificationProvider },
  )
  await settleTheAction()
  const warnings = () => shownWarnings(result)
  return { owner, result, warnings }
}

/** Imports a file that refers to the pack asset, waits until the import has ended, and reads the warnings. */
async function importFileReferringToThePackAsset() {
  const rendered = await renderWorkspaceOnAProject()
  await act(async () => {
    await rendered.result.current.state.actions.onImportDroppedFile?.(
      projectFileReferring(PACK_REFERENCE),
    )
  })
  await waitFor(() => expect(rendered.owner.results).toHaveLength(1))
  expect(rendered.owner.results[0]?.ok).toBe(true)
  await settleTheAction()
  return rendered.warnings
}

describe('the import of a file through the actions of the workspace', () => {
  it('shows no warning for a pack asset that the library of the application lists', async () => {
    library.items = [furnitureItem(PACK_REFERENCE)]

    const warnings = await importFileReferringToThePackAsset()

    expect(warnings()).toEqual([])
  })

  it('shows the warning for a pack asset that the library of the application does not list', async () => {
    library.items = []

    const warnings = await importFileReferringToThePackAsset()

    await waitFor(() => expect(warnings()).toEqual([ONE_MISSING_SENTENCE]))
  })
})
