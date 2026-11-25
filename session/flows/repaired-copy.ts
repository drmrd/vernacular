import type { Project, RepairOffer } from '../../core'

const REPAIRED_COPY_SUFFIX = ' (repaired copy)'

/** The name of a repaired copy: "<name> (repaired copy)". */
export function repairedCopyName(name: string): string {
  return `${name}${REPAIRED_COPY_SUFFIX}`
}

/** The document of the offer, under the name of a repaired copy. The offer is not changed. */
export function repairedCopyOf(offer: RepairOffer): Project {
  const { document } = offer
  return { ...document, meta: { ...document.meta, name: repairedCopyName(document.meta.name) } }
}
