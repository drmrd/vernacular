import {
  SCOPE_PRECEDENCE,
  missingAsset,
  orderScopesByPrecedence,
  resolvedAsset,
  type AssetDescription,
  type AssetFootprint,
  type AssetReference,
  type AssetResolution,
  type ScopeKind,
} from '../../core'
import type { AssetSource, LibraryItem } from './asset-source'

/** Options that adjust how the registry degrades when an asset is missing. */
export interface AssetRegistryOptions {
  /** Footprint to draw a placeholder at when an asset cannot be resolved. */
  footprintFor?: (reference: AssetReference) => AssetFootprint | undefined
}

/** A source tagged with the scope kind it stands for, for precedence ordering. */
export interface ScopedAssetSource {
  kind: ScopeKind
  source: AssetSource
}

/**
 * Aggregates asset sources. `resolve` follows the graceful-degradation
 * precedence of design specification section 4.2: the exactly-requested scope
 * first, then a hash match in another source by precedence. `describe` asks the
 * sources by the same precedence and returns at once the description from the
 * source named by the reference scope, else the first description found. `list` concatenates every source in scope precedence order.
 */
export class AssetRegistry {
  constructor(
    private readonly sources: readonly ScopedAssetSource[],
    private readonly options: AssetRegistryOptions = {},
  ) {}

  async resolve(reference: AssetReference): Promise<AssetResolution> {
    const kinds = orderScopesByPrecedence(reference, this.availableKinds())
    for (const scoped of this.sourcesInOrder(kinds)) {
      const bytes = await scoped.source.read(reference.contentHash)
      if (bytes !== undefined) {
        return resolvedAsset(bytes, resolvedScopeFor(scoped, reference))
      }
    }
    return this.notResolved(reference)
  }

  async list(): Promise<LibraryItem[]> {
    const items: LibraryItem[] = []
    for (const scoped of this.sourcesInOrder(SCOPE_PRECEDENCE)) {
      const listed = (await scoped.source.list?.()) ?? []
      items.push(...listed)
    }
    return items
  }

  async describe(reference: AssetReference): Promise<AssetDescription | undefined> {
    const kinds = orderScopesByPrecedence(reference, this.availableKinds())
    let firstFound: AssetDescription | undefined
    for (const scoped of this.sourcesInOrder(kinds)) {
      const description = await scoped.source.describe?.(reference.contentHash)
      if (description === undefined) continue
      // A pack source learns its id only once its manifest loads, so compare after the call.
      if (scoped.source.id === reference.scope) return description
      firstFound ??= description
    }
    return firstFound
  }

  private availableKinds(): ScopeKind[] {
    return this.sources.map((scoped) => scoped.kind)
  }

  private *sourcesInOrder(kinds: Iterable<ScopeKind>): Generator<ScopedAssetSource> {
    for (const kind of kinds) {
      for (const scoped of this.sources) {
        if (scoped.kind === kind) {
          yield scoped
        }
      }
    }
  }

  // Design specification section 4.2 step 4: a clearly-labeled placeholder with
  // the correct footprint so editing continues and the asset panel surfaces the
  // gap with a recovery path.
  private notResolved(reference: AssetReference): AssetResolution {
    const footprint = this.options.footprintFor?.(reference)
    return missingAsset(reference, footprint)
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
