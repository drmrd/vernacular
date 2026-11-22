import type { Opening } from '../model/types'

/** The opening without its main entrance mark; the same object when it carries none. */
export function withoutEntranceMark(opening: Opening): Opening {
  if (!('entrance' in opening)) {
    return opening
  }
  const unmarked = { ...opening }
  delete unmarked.entrance
  return unmarked
}
