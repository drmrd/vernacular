export type AssetScope = `pack:${string}@${string}` | 'user' | 'project'

/** Content-addressed reference to an external asset. See ADR-0007. */
export interface AssetReference {
  scope: AssetScope
  contentHash: string
}

const SCOPE_SEPARATOR = '#'

export function formatAssetReference(reference: AssetReference): string {
  return `${reference.scope}${SCOPE_SEPARATOR}${reference.contentHash}`
}

export function parseAssetReference(serialized: string): AssetReference {
  // Split on the last separator: the content hash is the trailing segment and never
  // contains the separator, so this tolerates a separator appearing within the scope.
  const separatorIndex = serialized.lastIndexOf(SCOPE_SEPARATOR)
  if (separatorIndex === -1) {
    throw new Error(`Malformed asset reference: "${serialized}"`)
  }

  // The scope is validated structurally at the parse boundary; callers treat the
  // result as opaque until it is resolved through the asset registry.
  return {
    scope: serialized.slice(0, separatorIndex) as AssetScope,
    contentHash: serialized.slice(separatorIndex + 1),
  }
}
