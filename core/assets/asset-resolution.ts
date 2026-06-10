import type { AssetReference, AssetScope } from '../model/asset-reference'

/** Coarse category of a scope, used for resolution precedence. */
export type ScopeKind = 'user' | 'project' | 'pack' | 'bundled'

/**
 * Source precedence for a hash match found outside the requested scope (design
 * specification section 4.2 step 2). Content addressing makes substitution safe,
 * so a higher-trust source wins when the same bytes appear in several.
 */
export const SCOPE_PRECEDENCE: readonly ScopeKind[] = ['user', 'project', 'pack', 'bundled']

/**
 * The scope kinds to consult, the requested kind first (the section 4.2 step 1
 * exact-match preference), then the remaining available kinds in precedence
 * order. Duplicates are removed; unavailable kinds are dropped.
 */
export function orderScopesByPrecedence(
  requested: AssetReference,
  available: readonly ScopeKind[],
): ScopeKind[] {
  const requestedKind = scopeKindOf(requested.scope)
  const ordered = [requestedKind, ...SCOPE_PRECEDENCE.filter((kind) => kind !== requestedKind)]
  return ordered.filter((kind) => available.includes(kind))
}

export interface AssetFootprint {
  width: number
  depth: number
  height: number
}

export interface ResolvedAsset {
  outcome: 'resolved'
  bytes: Uint8Array
  resolvedScope: AssetScope
}

export interface MissingAsset {
  outcome: 'missing'
  label: string
  reference: AssetReference
  footprint?: AssetFootprint
}

export type AssetResolution = ResolvedAsset | MissingAsset

export function resolvedAsset(bytes: Uint8Array, resolvedScope: AssetScope): ResolvedAsset {
  return { outcome: 'resolved', bytes, resolvedScope }
}

export function missingAsset(reference: AssetReference, footprint?: AssetFootprint): MissingAsset {
  const missing: MissingAsset = {
    outcome: 'missing',
    label: `Missing asset (${reference.scope})`,
    reference,
  }
  if (footprint !== undefined) {
    missing.footprint = footprint
  }
  return missing
}

/** Map a full scope to its coarse kind: any `pack:...@...` scope is `'pack'`. */
function scopeKindOf(scope: AssetScope): ScopeKind {
  if (scope === 'user' || scope === 'project') {
    return scope
  }
  return scope.startsWith('pack:') ? 'pack' : 'bundled'
}
