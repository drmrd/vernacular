import { packSuppliesFrom, type LibraryItem, type PackSupplies } from '../storage'

/** A library that lists the items it holds. */
export interface LibraryLister {
  list(): Promise<readonly LibraryItem[]>
}

/** A library whose catalog includes the unlisted pack sources that the listing leaves out. */
export interface PackCatalog {
  catalog(): Promise<readonly LibraryItem[]>
}

/**
 * What the installed packs supply, read when the action runs. With no library nothing is known, so
 * the result is undefined. A library whose catalog cannot be read gives a function that accepts
 * every reference, so a pack that cannot be read raises no false report.
 */
export async function loadPackSupplies(
  library: PackCatalog | undefined,
): Promise<PackSupplies | undefined> {
  if (library === undefined) {
    return undefined
  }
  try {
    return packSuppliesFrom(await library.catalog())
  } catch (error: unknown) {
    console.warn(
      'The asset library catalog cannot be read; no pack asset counts as missing.',
      error,
    )
    return () => true
  }
}
