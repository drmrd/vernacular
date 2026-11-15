// scripts/schema/build-known-keys.mjs
//
// Pure builder for the table of known keys (ADR-0184). It reads the CORE JSON
// Schema and lists, for each object type, the keys the schema defines, what
// sits under each key, and which keys are optional. The save-time graft reads
// the table to tell a cleared known key from a key the reader never knew.

const ROOT_TYPE = 'Project'
const DEFINITION_PREFIX = '#/definitions/'
const EXTENSIONS_DEFINITION = 'Extensions'

const LEAF = { kind: 'leaf' }
const OPAQUE = { kind: 'opaque' }

function definitionName(ref) {
  if (!ref.startsWith(DEFINITION_PREFIX)) {
    throw new Error(`Unsupported schema reference: ${ref}`)
  }
  return ref.slice(DEFINITION_PREFIX.length)
}

function isObjectDefinition(definition) {
  return definition.type === 'object' && definition.properties !== undefined
}

function isUnionDefinition(definition) {
  return Array.isArray(definition.anyOf)
}

function isOpenValue(node) {
  return node === true || (typeof node === 'object' && Object.keys(node).length === 0)
}

function variantTag(unionName, variant) {
  const tagged = Object.values(variant.properties ?? {}).find((property) => 'const' in property)
  if (tagged === undefined) {
    throw new Error(`Union ${unionName} has a variant without a constant tag`)
  }
  return `${unionName}.${tagged.const}`
}

function unionVariantNames(unionName, definition) {
  return definition.anyOf.map((variant) => variantTag(unionName, variant))
}

function describeReference(schema, ref) {
  const name = definitionName(ref)
  if (name === EXTENSIONS_DEFINITION) return OPAQUE
  const definition = schema.definitions[name]
  if (definition === undefined) throw new Error(`Missing schema definition: ${name}`)
  if (isUnionDefinition(definition)) {
    return { kind: 'union', types: unionVariantNames(name, definition) }
  }
  if (isObjectDefinition(definition)) return { kind: 'object', type: name }
  if (definition.type === 'object') throw new Error(`Unsupported object definition: ${name}`)
  return LEAF
}

function describeValue(schema, node) {
  if (isOpenValue(node)) return OPAQUE
  if (typeof node.$ref === 'string') return describeReference(schema, node.$ref)
  if (node.type === 'array') {
    const item = describeValue(schema, node.items)
    return item.kind === 'leaf' ? LEAF : { kind: 'array', item }
  }
  if (node.type === 'object') {
    if (node.properties !== undefined || node.additionalProperties === undefined) {
      throw new Error(`Unsupported inline object: ${JSON.stringify(node)}`)
    }
    if (isOpenValue(node.additionalProperties)) return OPAQUE
    return { kind: 'map', value: describeValue(schema, node.additionalProperties) }
  }
  if (node.anyOf !== undefined || node.oneOf !== undefined || node.allOf !== undefined) {
    throw new Error(`Unsupported inline composition: ${JSON.stringify(node)}`)
  }
  return LEAF
}

function describeType(schema, objectSchema) {
  const keys = {}
  for (const [key, property] of Object.entries(objectSchema.properties)) {
    keys[key] = describeValue(schema, property)
  }
  const required = new Set(objectSchema.required ?? [])
  const optional = Object.keys(objectSchema.properties).filter((key) => !required.has(key))
  return { keys, optional }
}

/**
 * Build the table of known keys from the CORE JSON Schema.
 *
 * @param {object} schema the JSON Schema for a Project Document
 * @returns {Record<string, { keys: Record<string, object>, optional: string[] }>}
 */
export function buildKnownKeys(schema) {
  const table = { [ROOT_TYPE]: describeType(schema, schema) }
  for (const [name, definition] of Object.entries(schema.definitions)) {
    if (isObjectDefinition(definition)) {
      table[name] = describeType(schema, definition)
    } else if (isUnionDefinition(definition)) {
      for (const variant of definition.anyOf) {
        table[variantTag(name, variant)] = describeType(schema, variant)
      }
    }
  }
  return table
}
