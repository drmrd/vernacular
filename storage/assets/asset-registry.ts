import {
  orderScopesByPrecedence,
  resolvedAsset,
  type AssetFootprint,
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
        return resolvedAsset(bytes, scopeForKind(kind, reference))
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
 * The scope to report for a resolved hit. When the hit came from the requested
 * scope's kind, report the exact requested scope; otherwise report the kind as a
 * plain scope label (`'user'` / `'project'`), or for a pack hit, the requested
 * scope is kept since the cross-pack-version case is handled in Task 5.
 */
function scopeForKind(kind: ScopeKind, reference: AssetReference): AssetReference['scope'] {
  if (kind === 'user' || kind === 'project') {
    return kind
  }
  return reference.scope
}

export type { AssetFootprint }
