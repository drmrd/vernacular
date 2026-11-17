// Type declarations for build-schema.mjs (the pure CORE schema builder) so the
// conformance and drift-guard tests can import it under the strict TypeScript
// config (allowJs is off, so an untyped .mjs import would otherwise be an error).

/** The live format version, read from core/model/factories.ts. */
export const SCHEMA_VERSION: number

/** The live additive revision within the format version, read from core/model/factories.ts. */
export const SCHEMA_REVISION: number

/** The revision that keeps the schema path used before revisions existed. */
export const INITIAL_REVISION: number

/** Repository-relative path of the schema for a version and revision. */
export function schemaPath(version: number, revision: number): string

/** The numbers that decide whether a changed schema is allowed. */
export interface DriftNumbers {
  version: number
  revision: number
  committedVersion: number
  committedRevision: number
}

/** Decide whether a regenerated schema may differ from the latest committed one. */
export function driftVerdict(
  committed: string | null,
  regenerated: string,
  numbers: DriftNumbers,
): { ok: true } | { ok: false; message: string }

/** Stable, versioned identifier for the published CORE schema. */
export const SCHEMA_ID: string

/** Build the CORE JSON Schema for a Project Document from the model types. */
export function buildProjectSchema(): object
