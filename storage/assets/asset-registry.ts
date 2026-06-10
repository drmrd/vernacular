import {
  orderScopesByPrecedence,
  resolvedAsset,
  type AssetReference,
  type AssetResolution,
  type ScopeKind,
} from '../../core'
import type { AssetSource } from './asset-source'

/** A source tagged with the scope kind it stands for, for precedence ordering. */
export interface ScopedAssetSource {
  kind: ScopeKind
  source: AssetSource
}

/**
 * Aggregates asset sources and resolves a content-addressed reference with the
 * graceful-degradation precedence of design specification section 4.2: the
 * exactly-requested scope first, then a hash match in another source by
 * precedence. Pack-version fallback and the missing-asset placeholder are added
 * in later slices of this track.
 */
export class AssetRegistry {
  constructor(private readonly sources: readonly ScopedAssetSource[]) {}

  async resolve(reference: AssetReference): Promise<AssetResolution> {
    const order = orderScopesByPrecedence(reference, this.availableKinds())
    for (const kind of order) {
      const resolution = await this.readFromKind(kind, reference)
      if (resolution !== undefined) {
        return resolution
      }
    }
    return this.notResolved(reference)
  }

  private availableKinds(): ScopeKind[] {
    return this.sources.map((scoped) => scoped.kind)
  }

  private async readFromKind(
    kind: ScopeKind,
    reference: AssetReference,
  ): Promise<AssetResolution | undefined> {
    for (const scoped of this.sources) {
      if (scoped.kind !== kind) {
        continue
      }
      const bytes = await scoped.source.read(reference.contentHash)
      if (bytes !== undefined) {
        return resolvedAsset(bytes, resolvedScopeFor(scoped, reference))
      }
    }
    return undefined
  }

  // Overridden in Task 6 to return a labeled placeholder. For now, a request
  // that finds no bytes throws so the missing path is unmistakably unimplemented
  // until its own RED test drives it.
  protected notResolved(reference: AssetReference): AssetResolution {
    throw new Error(`Unresolved asset reference: ${reference.scope}#${reference.contentHash}`)
  }
}

/**
 * The scope to report for a resolved hit. A pack hit reports the source's own
 * scope id, so a pack-version fallback (design specification section 4.2 step 3)
 * surfaces the version that actually held the bytes. A user or project hit
 * reports the kind as its plain scope.
 */
function resolvedScopeFor(
  scoped: ScopedAssetSource,
  reference: AssetReference,
): AssetReference['scope'] {
  if (scoped.kind === 'user' || scoped.kind === 'project') {
    return scoped.kind
  }
  if (isPackScope(scoped.source.id)) {
    return scoped.source.id
  }
  return reference.scope
}

/** Narrows a source id to a pack scope (`pack:<name>@<version>`). */
function isPackScope(value: string): value is `pack:${string}@${string}` {
  return /^pack:.+@.+$/.test(value)
}
