import { parseDocumentJson } from './codec/document-json'
import { asRecord } from './codec/json-values'

/**
 * The display name of a stored document, read without a migration or a schema check, so a project
 * at a newer version or with an unknown field still has a name. Never throws: bytes that are not a
 * JSON object with an object `meta` holding a string `name` give undefined.
 */
export function bestEffortProjectName(bytes: Uint8Array): string | undefined {
  try {
    const name = asRecord(asRecord(parseDocumentJson(bytes))?.meta)?.name
    return typeof name === 'string' ? name : undefined
  } catch {
    return undefined
  }
}
