const UNWRITABLE_MESSAGE = 'The stored record cannot be written as JSON.'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function sameElements(stored: unknown[], parsed: unknown[]): boolean {
  if (stored.length !== parsed.length) {
    return false
  }
  for (let index = 0; index < stored.length; index += 1) {
    if (!sameInJson(stored[index], parsed[index])) {
      return false
    }
  }
  return true
}

/** A property whose value is undefined is absent from JSON, so it is not compared. */
function sameProperties(stored: Record<string, unknown>, parsed: Record<string, unknown>): boolean {
  const names = Object.keys(stored).filter((name) => stored[name] !== undefined)
  return (
    names.length === Object.keys(parsed).length &&
    names.every((name) => Object.hasOwn(parsed, name) && sameInJson(stored[name], parsed[name]))
  )
}

/** Whether the stored value equals what JSON keeps of it: nothing but undefined properties may be lost. */
function sameInJson(stored: unknown, parsed: unknown): boolean {
  if (Array.isArray(stored)) {
    return Array.isArray(parsed) && sameElements(stored, parsed)
  }
  if (isPlainObject(stored)) {
    return isPlainObject(parsed) && sameProperties(stored, parsed)
  }
  return stored === parsed
}

function stringifyProject(project: unknown): string {
  let text: string | undefined
  try {
    text = JSON.stringify(project)
  } catch (cause) {
    throw new Error(UNWRITABLE_MESSAGE, { cause })
  }
  if (text === undefined) {
    throw new Error(UNWRITABLE_MESSAGE)
  }
  return text
}

/** The UTF-8 JSON text of a stored project. Throws an Error that names JSON when it cannot be written. */
export function jsonBytes(project: unknown): Uint8Array {
  return new TextEncoder().encode(stringifyProject(project))
}

/**
 * The UTF-8 JSON text of a stored project, or undefined when JSON cannot write
 * it or would change it. Only a property whose value is undefined may drop out.
 * Reading the text back must give the stored object again, so nothing is lost
 * when the file replaces the record.
 */
export function faithfulJsonBytes(project: unknown): Uint8Array | undefined {
  try {
    const text = stringifyProject(project)
    return sameInJson(project, JSON.parse(text)) ? new TextEncoder().encode(text) : undefined
  } catch {
    return undefined
  }
}
