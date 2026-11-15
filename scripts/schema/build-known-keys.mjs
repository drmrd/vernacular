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

function unionVariants(definition) {
  return definition.anyOf ?? definition.oneOf
}

function isUnionDefinition(definition) {
  return Array.isArray(unionVariants(definition))
}

function isOpenValue(node) {
  return node === true || (typeof node === 'object' && Object.keys(node).length === 0)
}

const SCALAR_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'null'])

function isScalar(node) {
  return 'enum' in node || 'const' in node || SCALAR_TYPES.has(node.type)
}

function unsupportedShape(place, node) {
  return new Error(`${place} has a shape the table cannot express: ${JSON.stringify(node)}`)
}

function constantKeys(variant) {
  return Object.entries(variant.properties ?? {})
    .filter(([, property]) => 'const' in property)
    .map(([key]) => key)
}

function sharedTagKey(unionName, variants) {
  const [first, ...rest] = variants.map(constantKeys)
  const tag = (first ?? []).find((key) => rest.every((keys) => keys.includes(key)))
  if (tag === undefined) {
    throw new Error(`Union ${unionName} has no constant tag that every variant shares`)
  }
  return tag
}

function unionVariantTypes(unionName, definition) {
  const variants = unionVariants(definition)
  const tag = sharedTagKey(unionName, variants)
  const types = new Map()
  for (const variant of variants) {
    const tagValue = variant.properties[tag].const
    const typeName = `${unionName}.${tagValue}`
    if (types.has(typeName)) {
      throw new Error(`Union ${unionName} has two variants with the tag value ${tagValue}`)
    }
    types.set(typeName, variant)
  }
  return { tag, types }
}

function describeReference(schema, ref) {
  const name = definitionName(ref)
  if (name === EXTENSIONS_DEFINITION) return OPAQUE
  const definition = schema.definitions[name]
  if (definition === undefined) throw new Error(`Missing schema definition: ${name}`)
  if (isUnionDefinition(definition)) {
    const { tag, types } = unionVariantTypes(name, definition)
    return { kind: 'union', tag, types: [...types.keys()] }
  }
  if (isObjectDefinition(definition)) return { kind: 'object', type: name }
  if (isScalar(definition)) return LEAF
  throw unsupportedShape(`Definition ${name}`, definition)
}

function describeArray(schema, node, place) {
  const items = node.items
  if (items === undefined || Array.isArray(items) || 'prefixItems' in node) {
    throw unsupportedShape(`${place} (a tuple)`, node)
  }
  if (items.type === 'array') throw unsupportedShape(`${place} (an array of arrays)`, node)
  const item = describeValue(schema, items, `${place}[]`)
  return item.kind === 'leaf' ? LEAF : { kind: 'array', item }
}

function describeValue(schema, node, place) {
  if (isOpenValue(node)) return OPAQUE
  if (typeof node.$ref === 'string') return describeReference(schema, node.$ref)
  if (node.type === 'array') return describeArray(schema, node, place)
  if (node.type === 'object') {
    if (node.properties !== undefined || node.additionalProperties === undefined) {
      throw unsupportedShape(`${place} (an inline object)`, node)
    }
    if (isOpenValue(node.additionalProperties)) return OPAQUE
    return { kind: 'map', value: describeValue(schema, node.additionalProperties, `${place}.*`) }
  }
  if (isScalar(node)) return LEAF
  throw unsupportedShape(place, node)
}

function describeType(schema, objectSchema, typeName) {
  const keys = {}
  for (const [key, property] of Object.entries(objectSchema.properties)) {
    keys[key] = describeValue(schema, property, `${typeName}.${key}`)
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
  const table = { [ROOT_TYPE]: describeType(schema, schema, ROOT_TYPE) }
  for (const [name, definition] of Object.entries(schema.definitions)) {
    if (isObjectDefinition(definition)) {
      table[name] = describeType(schema, definition, name)
    } else if (isUnionDefinition(definition)) {
      for (const [typeName, variant] of unionVariantTypes(name, definition).types) {
        table[typeName] = describeType(schema, variant, typeName)
      }
    }
  }
  return table
}
