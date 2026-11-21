import { isValidProjectId } from '../storage'

export type Place =
  | { readonly kind: 'start' | 'projects' }
  | { readonly kind: 'project'; readonly id: string }

const PROJECTS_FRAGMENT = '#/projects'
const PROJECT_FRAGMENT_PREFIX = '#/project/'

/** The place that a fragment names. Anything that is not an exact address is the start. */
export function parseAddress(hash: string): Place {
  if (hash === PROJECTS_FRAGMENT) {
    return { kind: 'projects' }
  }
  if (hash.startsWith(PROJECT_FRAGMENT_PREFIX)) {
    const id = hash.slice(PROJECT_FRAGMENT_PREFIX.length)
    if (isValidProjectId(id)) {
      return { kind: 'project', id }
    }
  }
  return { kind: 'start' }
}

/** The fragment of a place: '', '#/projects', or '#/project/<id>'. */
export function addressFor(place: Place): string {
  switch (place.kind) {
    case 'start':
      return ''
    case 'projects':
      return PROJECTS_FRAGMENT
    case 'project':
      return isValidProjectId(place.id) ? PROJECT_FRAGMENT_PREFIX + place.id : ''
  }
}
