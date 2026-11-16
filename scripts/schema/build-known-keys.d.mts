// Type declarations for build-known-keys.mjs (the pure builder of the table of
// known keys) so the format tests can import it under the strict TypeScript
// config (allowJs is off, so an untyped .mjs import would otherwise be an error).

import type { KnownKeyTable } from '../../core/model/known-keys'

/** Build the table of known keys from the CORE JSON Schema. */
export function buildKnownKeys(schema: object): KnownKeyTable
