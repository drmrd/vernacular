export const CATALOG_FILE = 'catalog.json'

export type PackTextFile = 'LICENSE' | 'NOTICE' | 'CHANGELOG.md'

export function manifestPath(sha256: string): string {
  return `manifests/sha256/${sha256}.json`
}

export function blobPath(contentHash: string): string {
  return `blobs/sha256/${contentHash}`
}

export function packTextPath(packId: string, version: string, file: PackTextFile): string {
  return `packs/${packId}-${version}/${file}`
}
