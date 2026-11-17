// Type declarations for build-validators.mjs (the pure builder of the standalone validators) so
// tests can import it under the strict TypeScript config (allowJs is off).

/** Repository-relative path of the strict validator. */
export const STRICT_VALIDATOR_PATH: string

/** Repository-relative path of the tolerant validator. */
export const TOLERANT_VALIDATOR_PATH: string

/** Repository-relative path of the declaration of the strict validator. */
export const STRICT_DECLARATION_PATH: string

/** Repository-relative path of the declaration of the tolerant validator. */
export const TOLERANT_DECLARATION_PATH: string

/** The text of the declaration that both validators share. */
export function buildValidatorDeclaration(): string

/** A copy of a schema in which no object rejects unknown fields. */
export function withoutClosedObjects(node: unknown): unknown

/** The standalone source of the strict and the tolerant validator for a schema. */
export function buildValidatorSources(schema: object): { strict: string; tolerant: string }
