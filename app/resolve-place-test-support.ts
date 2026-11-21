import type { DocumentHandle } from '../session'
import type { Place } from './address'
import type { Screen } from './resolve-place'

/** Test support: the places and the screens that the tests of `resolvePlace` name and read. */

/** The start: the place of the bare address. */
export const START: Place = { kind: 'start' }

/** The place of the Projects page. */
export const PROJECTS: Place = { kind: 'projects' }

/** The place of the project under `id`. */
export function projectPlace(id: string): Place {
  return { kind: 'project', id }
}

/** The handle of a screen that must show the editor. */
export function editorHandleOf(screen: Screen): DocumentHandle {
  if (screen.kind !== 'editor') {
    throw new Error(`Expected the editor, got ${JSON.stringify(screen)}`)
  }
  return screen.handle
}

/** The screen of the page that tells why the project under `id` did not open. */
export function pageAfterFailure(id: string, failure: unknown) {
  return { kind: 'projects', notice: { id, failure } }
}
