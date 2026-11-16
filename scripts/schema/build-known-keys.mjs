// scripts/schema/build-known-keys.mjs
//
// Pure builder for the table of known keys (ADR-0184). It reads the CORE JSON
// Schema and lists, for each object type, the keys the schema defines, what
// sits under each key, and which keys are optional. The save-time graft reads
// the table to tell a cleared known key from a key the reader never knew.
//
// The graft treats every absent known key as one the user deleted, so a shape
// the table cannot express must stop the build with a named error. Nothing is
// accepted silently.

const ROOT_TYPE = 'Project'
const DEFINITION_PREFIX = '#/definitions/'
const EXTENSIONS_DEFINITION = 'Extensions'

const LEAF = { kind: 'leaf' }
const OPAQUE = { kind: 'opaque' }

const REFERENCE_KEY = '$ref'
const ANNOTATION_KEYWORDS = new Set(['description', 'title', '$comment'])
const UNION_KEYWORDS = ['anyOf', 'oneOf']

const REFUSAL_HINT =
  'Model the value as a tagged union of objects, a typed map, or an open value, or extend the table.'

function refusal(message) {
  return new Error(`${message}. ${REFUSAL_HINT}`)
}

function unsupportedShape(place, node) {
  return refusal(`${place} has a shape the table cannot express: ${JSON.stringify(node)}`)
}

function definitionName(ref, place) {
  if (!ref.startsWith(DEFINITION_PREFIX)) {
    throw refusal(`${place} has an unsupported schema reference ${ref}`)
  }
  return ref.slice(DEFINITION_PREFIX.length)
}

function unionKeyword(definition) {
  return UNION_KEYWORDS.find((keyword) => Array.isArray(definition[keyword]))
}

function unionVariants(definition) {
  return definition[unionKeyword(definition)]
}

function isUnionDefinition(definition) {
  return unionKeyword(definition) !== undefined
}

function isObjectDefinition(definition) {
  return definition.type === 'object' && definition.properties !== undefined
}

function refuseMixedDefinition(name, definition) {
  const keyword = unionKeyword(definition)
  if (keyword !== undefined && definition.properties !== undefined) {
    throw refusal(`Definition ${name} mixes properties with ${keyword}`)
  }
}

function isOpenValue(node) {
  return node === true || (typeof node === 'object' && Object.keys(node).length === 0)
}

const SCALAR_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'null'])

function isScalar(node) {
  return 'enum' in node || 'const' in node || SCALAR_TYPES.has(node.type)
}

function isObjectWithNoProperties(node) {
  return node.additionalProperties === false && node.properties === undefined
}

function refuseUnexpressibleNode(place, node) {
  if (Array.isArray(node.type)) {
    throw refusal(`${place} has a type list ${JSON.stringify(node.type)}`)
  }
  if (isObjectWithNoProperties(node)) {
    throw refusal(`${place} is an object with no properties and additionalProperties false`)
  }
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
    throw refusal(`Union ${unionName} has no constant tag that every variant shares`)
  }
  return tag
}

function unionVariantTypes(unionName, definition) {
  const variants = unionVariants(definition)
  const tag = sharedTagKey(unionName, variants)
  const types = new Map()
  for (const variant of variants) {
    const tagValue = variant.properties[tag].const
    if (typeof tagValue !== 'string') {
      throw refusal(
        `Union ${unionName} has a tag value that is not a string: ${JSON.stringify(tagValue)}`,
      )
    }
    const typeName = `${unionName}.${tagValue}`
    if (types.has(typeName)) {
      throw refusal(`Union ${unionName} has two variants with the tag value ${tagValue}`)
    }
    types.set(typeName, { value: tagValue, variant })
  }
  return { tag, types }
}

function refuseUnexpressibleDefinition(name, definition) {
  const place = `Definition ${name}`
  refuseUnexpressibleNode(place, definition)
  if (definition.type === 'array' && definition.items?.type === 'array') {
    throw refusal(`${place} is an array of arrays`)
  }
  throw unsupportedShape(place, definition)
}

function refuseReferenceSiblings(place, node) {
  const siblings = Object.keys(node).filter(
    (key) => key !== REFERENCE_KEY && !ANNOTATION_KEYWORDS.has(key),
  )
  if (siblings.length > 0) {
    throw refusal(`${place} has a $ref with sibling keywords ${siblings.join(', ')}`)
  }
}

function describeReference(schema, node, place) {
  refuseReferenceSiblings(place, node)
  const name = definitionName(node.$ref, place)
  if (name === EXTENSIONS_DEFINITION) return OPAQUE
  const definition = schema.definitions[name]
  if (definition === undefined) throw refusal(`${place} refers to a missing definition ${name}`)
  refuseMixedDefinition(name, definition)
  if (isUnionDefinition(definition)) {
    const { tag, types } = unionVariantTypes(name, definition)
    const variants = [...types].map(([type, { value }]) => ({ value, type }))
    return { kind: 'union', tag, variants }
  }
  if (isObjectDefinition(definition)) return { kind: 'object', type: name }
  if (isScalar(definition)) return LEAF
  return refuseUnexpressibleDefinition(name, definition)
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

function describeMap(schema, node, place) {
  if (node.properties !== undefined || node.additionalProperties === undefined) {
    throw unsupportedShape(`${place} (an inline object)`, node)
  }
  if (isOpenValue(node.additionalProperties)) return OPAQUE
  return { kind: 'map', value: describeValue(schema, node.additionalProperties, `${place}.*`) }
}

function describeValue(schema, node, place) {
  if (isOpenValue(node)) return OPAQUE
  if (typeof node.$ref === 'string') return describeReference(schema, node, place)
  refuseUnexpressibleNode(place, node)
  if (node.type === 'array') return describeArray(schema, node, place)
  if (node.type === 'object') return describeMap(schema, node, place)
  if (isScalar(node)) return LEAF
  throw unsupportedShape(place, node)
}

function refuseOpenObject(typeName, objectSchema) {
  if ('patternProperties' in objectSchema) {
    throw refusal(`${typeName} mixes properties with patternProperties`)
  }
  const additional = objectSchema.additionalProperties
  if (additional !== undefined && additional !== false) {
    throw refusal(`${typeName} mixes properties with a schema-valued additionalProperties`)
  }
}

function describeType(schema, objectSchema, typeName) {
  refuseOpenObject(typeName, objectSchema)
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
    refuseMixedDefinition(name, definition)
    if (isObjectDefinition(definition)) {
      table[name] = describeType(schema, definition, name)
    } else if (isUnionDefinition(definition)) {
      for (const [typeName, { variant }] of unionVariantTypes(name, definition).types) {
        table[typeName] = describeType(schema, variant, typeName)
      }
    }
    // Any other definition is a scalar or an array alias; the table reads it where it is referenced.
  }
  return table
}
