// Type declarations for build-schema.mjs (the pure CORE schema builder) so the
// conformance and drift-guard tests can import it under the strict TypeScript
// config (allowJs is off, so an untyped .mjs import would otherwise be an error).

/** The live format version, read from core/model/factories.ts. */
export const SCHEMA_VERSION: number

/** Stable, versioned identifier for the published CORE schema. */
export const SCHEMA_ID: string

/** Build the CORE JSON Schema for a Project Document from the model types. */
export function buildProjectSchema(): object
