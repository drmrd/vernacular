import type { Project } from '../../core'

/** Pretty-printed (two-space) UTF-8 JSON bytes for project.json, with a trailing newline. */
export function serializeProjectJson(project: Project): Uint8Array {
  // The trailing newline keeps the output a well-formed text file that diffs cleanly.
  // Project key order ({ meta, floors }) is preserved by JSON.stringify, so the output
  // begins with "meta".
  return new TextEncoder().encode(JSON.stringify(project, null, 2) + '\n')
}

/** Parse project.json bytes into a raw document for migration. Throws on invalid JSON. */
export function parseProjectJson(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder().decode(bytes))
}

/** Read a project's display name from a parsed document, or undefined when absent or non-string. */
export function readProjectName(raw: unknown): string | undefined {
  const name = (raw as { meta?: { name?: unknown } }).meta?.name
  return typeof name === 'string' ? name : undefined
}
