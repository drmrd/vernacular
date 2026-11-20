import { act } from '@testing-library/react'
import type { AssetReference } from '../core'
import type { DocumentHandle } from '../session'
import { openOrThrow, workspaceRequest, type TestPorts } from '../session/handle/handle-test-kit'
import { projectReferring } from '../storage/zip/zip-test-kit'

/** Test support: open projects that place furniture, for the cases of the export report. */

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
