import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, vi } from 'vitest'
import type { AssetReference } from '../core'
import {
  NotificationProvider,
  useNotifications,
  type NotificationApi,
} from '../editor/design-system'
import type { DocumentHandle } from '../session'
import {
  createTestPorts,
  openOrThrow,
  workspaceRequest,
  type TestPorts,
} from '../session/handle/handle-test-kit'
import { projectReferring } from '../storage/zip/zip-test-kit'
import {
  actionsContext,
  settleTheAction,
  shownMessages,
  shownWarnings,
} from './action-test-support'
import type { LibraryLister } from './pack-supplies'
import { useExportBundleAction } from './use-export-actions'

/** Test support: open projects that place furniture, for the cases of the export report. */

/** The id of the project that `prepareBundleExport` opens. */
export const PROJECT_ID = 'current'

/** The log entries that a started download and a shown warning write. */
export const DOWNLOAD = 'download'
export const WARNING = 'warning'

/** The bytes that a held asset has. Their content is of no interest to the cases. */
const HELD_BYTES = new Uint8Array(1)

/** Every handle that `openProjectReferring` opened. `closeReferringHandles` closes them. */
const referringHandles: DocumentHandle[] = []

/** Closes every handle that a case opened through `openProjectReferring`. */
export async function closeReferringHandles(): Promise<void> {
  await act(async () => {
    await Promise.all(referringHandles.splice(0).map((handle) => handle.close()))
  })
}

interface ProjectToOpen {
  readonly id: string
  /** The assets that the project places, one piece of furniture for each. */
  readonly references: readonly AssetReference[]
  /** The assets whose bytes the pool of the project holds. The pool holds nothing else. */
  readonly held?: readonly AssetReference[] | undefined
}

/** Opens a new project that places the given references, over a pool that holds the held ones. */
export async function openProjectReferring(
  ports: TestPorts,
  { id, references, held = [] }: ProjectToOpen,
): Promise<DocumentHandle> {
  const pool = ports.workspace.assets(id)
  for (const { contentHash } of held) await pool.put(contentHash, HELD_BYTES)
  const request = { ...workspaceRequest(id), create: () => projectReferring(references) }
  const handle = await openOrThrow(ports, request)
  referringHandles.push(handle)
  return handle
}

interface ExportCase {
  /** The assets that the project places. */
  readonly references: readonly AssetReference[]
  /** The assets whose bytes the pool of the project holds. */
  readonly held?: readonly AssetReference[]
  /** The library that tells which pack assets an installed pack brings. */
  readonly packs?: LibraryLister
}

/** The bundle export on `handle`, with the toasts that show, and a log that the warning writes to. */
function renderBundleExport(handle: DocumentHandle, steps: string[], packs?: LibraryLister) {
  return renderHook(
    () => {
      const real = useNotifications()
      const notifications: NotificationApi = {
        ...real,
        warning: (message, options) => {
          steps.push(WARNING)
          return real.warning(message, options)
        },
      }
      const context = {
        ...actionsContext(handle, notifications),
        ...(packs === undefined ? {} : { packs }),
      }
      return { run: useExportBundleAction(context), shown: real.notifications }
    },
    { wrapper: NotificationProvider },
  )
}

/** The rendered bundle export of a project that places the references of `exportCase`. */
export type RenderedBundleExport = ReturnType<typeof renderBundleExport>['result']

/**
 * Opens the project of `exportCase` over `ports` and renders its bundle export, without running it.
 * The log of `steps` gets one entry when a download starts and one for each warning.
 */
export async function prepareBundleExport(exportCase: ExportCase, ports: TestPorts) {
  const { references, held } = exportCase
  const handle = await openProjectReferring(ports, { id: PROJECT_ID, references, held })
  const steps: string[] = []
  URL.createObjectURL = vi.fn(() => {
    steps.push(DOWNLOAD)
    return 'blob:test'
  })
  const { result } = renderBundleExport(handle, steps, exportCase.packs)
  return { steps, result }
}

/** The success toasts of an export that show now. */
export function exportedToasts(result: RenderedBundleExport): string[] {
  return shownMessages(result).filter((message) => message.startsWith('Exported '))
}

/** The error toasts of an export that show now. */
export function failedToasts(result: RenderedBundleExport): string[] {
  return result.current.shown.filter((s) => s.severity === 'error').map((s) => s.message)
}

/** Starts the export that `prepareBundleExport` rendered. */
export function startBundleExport(result: RenderedBundleExport): void {
  act(() => {
    result.current.run()
  })
}

/** Exports the project of `exportCase` as a bundle, waits for the success toast, and reports what showed. */
export async function exportBundle(exportCase: ExportCase) {
  const { steps, result } = await prepareBundleExport(exportCase, createTestPorts())
  startBundleExport(result)
  await waitFor(() => expect(exportedToasts(result)).toHaveLength(1))
  await settleTheAction()
  return { steps, warnings: shownWarnings(result), exported: exportedToasts(result) }
}
