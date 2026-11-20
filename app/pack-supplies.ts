import { packSuppliesFrom, type LibraryItem, type PackSupplies } from '../storage'

/** A library that lists the items it holds. */
export interface LibraryLister {
  list(): Promise<readonly LibraryItem[]>
}

/**
 * What the installed packs supply, read when the action runs. With no library nothing is known, so
 * the result is undefined. A library that cannot be listed gives a function that accepts every
 * reference, so a pack that cannot be read raises no false report.
 */
export async function loadPackSupplies(
  library: LibraryLister | undefined,
): Promise<PackSupplies | undefined> {
  if (library === undefined) {
    return undefined
  }
  try {
    return packSuppliesFrom(await library.list())
  } catch (error: unknown) {
    console.warn('The asset library cannot be listed; no pack asset counts as missing.', error)
    return () => true
  }
}
