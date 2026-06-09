export interface UnderlayRef {
  contentHash: string
}

/** The de-duplicated content hashes of underlays whose bitmap is not yet decoded. */
export function underlaysNeedingDecode(
  underlays: readonly UnderlayRef[],
  decoded: ReadonlySet<string>,
): string[] {
  const needed: string[] = []
  const seen = new Set<string>()
  for (const { contentHash } of underlays) {
    if (decoded.has(contentHash) || seen.has(contentHash)) {
      continue
    }
    seen.add(contentHash)
    needed.push(contentHash)
  }
  return needed
}
