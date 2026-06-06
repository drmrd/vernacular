/**
 * Trigger a browser download of `bytes` as `filename` via a transient object URL.
 *
 * This is the single place in the slice that touches `URL.createObjectURL` and a
 * synthetic anchor click, kept inside `storage/` per the rule that browser and
 * platform APIs are wrapped at a `storage/` seam (ADR-0001). The filename rule
 * lives in the pure `bundleFilename`; this helper only performs the DOM download.
 */
export function downloadBytes(bytes: Uint8Array, filename: string): void {
  // The DOM BlobPart type rejects a SharedArrayBuffer-backed view; the export
  // bytes are always ArrayBuffer-backed, so narrow to BlobPart at the boundary.
  const url = URL.createObjectURL(new Blob([bytes as BlobPart]))
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}
