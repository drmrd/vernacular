// JSON pointers (RFC 6901) for the places in a document that a repair names.

function escapeSegment(segment: string): string {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1')
}

/** The pointer of a child: the parent pointer, a slash, and the escaped segment. */
export function childPointer(parentPointer: string, segment: string | number): string {
  return `${parentPointer}/${escapeSegment(String(segment))}`
}

/** Pointers in ascending code-unit order, which is how `FormatFault.path` lists them. */
export function sortedPointers(pointers: readonly string[]): string[] {
  return [...pointers].sort()
}
