/** The item, or a thrown error that names what the reference project was expected to hold. */
export function required<T>(item: T | undefined, what: string): T {
  if (item === undefined) {
    throw new Error(`The reference project has no ${what}`)
  }
  return item
}
