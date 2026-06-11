import Ajv from 'ajv'
import type { ErrorObject, ValidateFunction } from 'ajv'
import type { DocumentValidationResult, DocumentValidator } from './validate-document'
import { createDocumentValidator } from './validate-document'

/** Maps a reverse-DNS extension namespace to the JSON Schema that validates its payloads. */
export type ExtensionSchemaRegistry = Map<string, object>

function compileRegistry(registry: ExtensionSchemaRegistry): Map<string, ValidateFunction> {
  const ajv = new Ajv({ allErrors: true, strict: false })
  const compiled = new Map<string, ValidateFunction>()
  for (const [namespace, schema] of registry) {
    compiled.set(namespace, ajv.compile(schema))
  }
  return compiled
}

function validateExtensions(
  extensions: Record<string, unknown>,
  compiled: Map<string, ValidateFunction>,
): ErrorObject[] {
  const errors: ErrorObject[] = []
  for (const [namespace, payload] of Object.entries(extensions)) {
    const validate = compiled.get(namespace)
    if (validate !== undefined && validate(payload) !== true) {
      errors.push(...(validate.errors ?? []))
    }
  }
  return errors
}

function isExtensionsObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function collectExtensions(node: unknown, found: Record<string, unknown>[]): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectExtensions(item, found)
    }
    return
  }
  if (!isExtensionsObject(node)) {
    return
  }
  if (isExtensionsObject(node.extensions)) {
    found.push(node.extensions)
  }
  for (const value of Object.values(node)) {
    collectExtensions(value, found)
  }
}

/**
 * The Strict profile (VFPF section 3): CORE validation plus per-namespace validation of registered
 * reverse-DNS extension namespaces against their published schemas. Unregistered namespaces pass.
 */
export function createStrictValidator(
  coreSchema: object,
  registry: ExtensionSchemaRegistry,
): DocumentValidator {
  const core = createDocumentValidator(coreSchema)
  const compiled = compileRegistry(registry)
  return (document: unknown): DocumentValidationResult => {
    const coreResult = core(document)
    const found: Record<string, unknown>[] = []
    collectExtensions(document, found)
    const extensionErrors = found.flatMap((extensions) => validateExtensions(extensions, compiled))
    const errors = [...coreResult.errors, ...extensionErrors]
    return { valid: errors.length === 0, errors }
  }
}
