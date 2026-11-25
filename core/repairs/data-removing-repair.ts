export interface DataRemovingRepair {
  readonly id: 'mixed-paint-entry' | 'undefined-fields'
  recognizes(document: unknown): boolean
  /** The repaired document and the JSON pointers of what was removed. The input is not changed. */
  apply(document: unknown): { readonly document: unknown; readonly removed: readonly string[] }
  /** One sentence, such as "It removes the extra data from 2 paint entries." */
  describe(removed: readonly string[]): string
}
