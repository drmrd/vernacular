import type { Project } from '../../core'
import type { PackSupplies, ProjectRecord } from '../../storage'
import { bundleFilename, buildUncheckedCopy, exportProjectBundle } from '../../storage'
import type { DocumentStore } from '../../storage'
import { findDocumentStore } from '../handle/find-document-store'
import type { DocumentHandle, OpenFailure } from '../handle/handle-types'
import { readForOpen } from '../handle/read-for-open'
import { messageOf } from '../handle/thrown-failures'
import type { SessionPorts } from '../ports'
import { UNNAMED_PROJECT, displayNameOf } from '../projects/display-name'
import { exportArchive } from './export-archive'
import { recentTarget } from './open-recent'

export interface ExportRequest {
  readonly id: string
  readonly packSupplies?: PackSupplies
  readonly onProgress?: (completed: number, total: number) => void
}

export type ExportFailure =
  | { readonly kind: 'not-found' | 'folder-permission' | 'folder-unavailable' }
  | { readonly kind: 'export-failed'; readonly message: string }

export type ExportProjectResult =
  | {
      readonly ok: true
      readonly kind: 'archive'
      readonly bytes: Uint8Array
      readonly fileName: string
      readonly missingAssets: readonly string[]
    }
  | {
      readonly ok: true
      readonly kind: 'unchecked-copy'
      readonly bytes: Uint8Array
      readonly fileName: string
      readonly includedAssets: number
    }
  | { readonly ok: false; readonly failure: ExportFailure }

const UNCHECKED_COPY_SUFFIX = ' unchecked copy'

function exportFailed(message: string): ExportProjectResult {
  return { ok: false, failure: { kind: 'export-failed', message } }
}

/** The failure of a step that reads the project. Only the fixed kinds pass through as they are. */
function failedWith(failure: OpenFailure): ExportProjectResult {
  switch (failure.kind) {
    case 'not-found':
    case 'folder-permission':
    case 'folder-unavailable':
      return { ok: false, failure: { kind: failure.kind } }
    case 'storage-unavailable':
      return exportFailed(failure.message)
    default:
      return exportFailed(`The project could not be read (${failure.kind}).`)
  }
}

/** The record of the id. An index that rejects counts as no record. */
async function recordOf(ports: SessionPorts, id: string): Promise<ProjectRecord | undefined> {
  try {
    return await ports.index.get(id)
  } catch {
    return undefined
  }
}

/** Packs the open project after its pending changes are written. */
async function exportOpenProject(
  current: DocumentHandle,
  { onProgress, packSupplies }: ExportRequest,
): Promise<ExportProjectResult> {
  const result = await exportArchive(current, {
    ...(onProgress === undefined ? {} : { onProgress }),
    ...(packSupplies === undefined ? {} : { packSupplies }),
  })
  if (!result.ok) {
    return exportFailed(result.message)
  }
  const { bytes, fileName, missingAssets } = result
  return { ok: true, kind: 'archive', bytes, fileName, missingAssets }
}

/** Packs a project that the read opened, from the assets of its store. */
async function archiveOfStored(
  store: DocumentStore,
  project: Project,
  { id, onProgress, packSupplies }: ExportRequest,
): Promise<ExportProjectResult> {
  const { bytes, missingAssets } = await exportProjectBundle(id, project, {
    assets: store.assets(id),
    ...(onProgress === undefined ? {} : { onProgress }),
    ...(packSupplies === undefined ? {} : { packSupplies }),
  })
  return {
    ok: true,
    kind: 'archive',
    bytes,
    fileName: bundleFilename(project.meta.name),
    missingAssets,
  }
}

/** Copies the stored files of a project that did not open, without checking them. */
async function uncheckedCopyOf(
  ports: SessionPorts,
  store: DocumentStore,
  id: string,
): Promise<ExportProjectResult> {
  const record = await recordOf(ports, id)
  const { bytes, includedAssets } = await buildUncheckedCopy(
    await store.storedFiles(id),
    store.assets(id),
    record?.assetHashes ?? [],
  )
  const shownName = record === undefined ? UNNAMED_PROJECT : displayNameOf(record)
  const fileName = bundleFilename(`${shownName}${UNCHECKED_COPY_SUFFIX}`)
  return { ok: true, kind: 'unchecked-copy', bytes, fileName, includedAssets }
}

/** Reads a project that is not open and packs it, or copies its files when it did not open. */
async function exportStoredProject(
  ports: SessionPorts,
  request: ExportRequest,
): Promise<ExportProjectResult> {
  const target = await recentTarget(ports, request.id)
  if (!target.ok) {
    return failedWith(target.failure)
  }
  const found = await findDocumentStore(ports, target.request)
  if (!found.ok) {
    return failedWith(found.failure)
  }
  const read = await readForOpen(found.store, target.request)
  if (read.ok) {
    return archiveOfStored(found.store, read.opened.project, request)
  }
  return read.failure.kind === 'did-not-open'
    ? uncheckedCopyOf(ports, found.store, request.id)
    : failedWith(read.failure)
}

/**
 * Packs the project of the id into a `.building` file. The open project is packed after its
 * pending changes are written. Any other project is read from its store, with no lock: a project
 * that opens gives an archive, and one that did not open gives a copy of its stored files that
 * was not checked. Never rejects. Takes no lock.
 */
export async function exportProject(
  ports: SessionPorts,
  current: DocumentHandle | undefined,
  request: ExportRequest,
): Promise<ExportProjectResult> {
  try {
    return current?.id === request.id
      ? await exportOpenProject(current, request)
      : await exportStoredProject(ports, request)
  } catch (error) {
    return exportFailed(messageOf(error))
  }
}
