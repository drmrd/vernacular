import type { Project } from '../../model/types'

/** Pretty-printed (two-space) UTF-8 JSON bytes of a document, with a trailing newline. */
export function serializeDocumentJson(project: Project): Uint8Array {
  // The trailing newline keeps the output a well-formed text file that diffs cleanly.
  // Project key order ({ meta, floors }) is preserved by JSON.stringify, so the output
  // begins with "meta".
  return new TextEncoder().encode(JSON.stringify(project, null, 2) + '\n')
}

/**
 * Parse the UTF-8 JSON bytes of a document. Throws on text that is not JSON. The bytes are decoded
 * leniently, as stored text was always read: an invalid byte becomes U+FFFD, so one bad byte in a
 * string does not make the file unreadable.
 */
export function parseDocumentJson(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder('utf-8').decode(bytes))
}
