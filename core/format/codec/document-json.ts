import type { Project } from '../../model/types'

/** Pretty-printed (two-space) UTF-8 JSON bytes of a document, with a trailing newline. */
export function serializeDocumentJson(project: Project): Uint8Array {
  // The trailing newline keeps the output a well-formed text file that diffs cleanly.
  // Project key order ({ meta, floors }) is preserved by JSON.stringify, so the output
  // begins with "meta".
  return new TextEncoder().encode(JSON.stringify(project, null, 2) + '\n')
}

/** Parse the UTF-8 JSON bytes of a document. Throws on bytes that are not UTF-8 JSON. */
export function parseDocumentJson(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
}
