import type { ProjectRecord } from '../../storage'
import { messageOf } from '../handle/thrown-failures'
import type { SessionPorts } from '../ports'

export interface StorageUnavailable {
  readonly kind: 'storage-unavailable'
  readonly message: string
}

/** The failure that a rejected storage call becomes in the flows of the project card. */
export function storageFailureOf(error: unknown): StorageUnavailable {
  return { kind: 'storage-unavailable', message: messageOf(error) }
}

/** The record of an id, or why it cannot be read. */
export type RecordRead =
  | { readonly record: ProjectRecord | undefined }
  | { readonly failure: StorageUnavailable }

/** Reads the record of the id from the index. Never rejects. */
export async function readRecord(ports: SessionPorts, id: string): Promise<RecordRead> {
  try {
    return { record: await ports.index.get(id) }
  } catch (error) {
    return { failure: storageFailureOf(error) }
  }
}
