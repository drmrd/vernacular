/*
 * Derives, from a published schema alone, the paths that a document must carry
 * for a fixture to exercise the whole format of that version. Each path is
 * reported as present or absent. The rules, in full:
 *
 *   1. Every property that the schema declares is present at least once
 *      somewhere in the document, scalars included. A leaf path reads
 *      `floors[].walls[].constructionProfile`.
 *   2. Every collection of objects holds at least one element somewhere: an
 *      array (`floors[]`) or an open map (`paint{}`) whose values are objects
 *      or unions of objects. A collection of plain values counts as a leaf
 *      property under rule 1.
 *   3. Every object-shaped variant of an `anyOf` union appears at least once.
 *      A variant is identified by its `const` discriminator property, and the
 *      path reads `paint{}:SurfaceTreatment(kind=pattern)`.
 *
 * The `extensions` property is an open namespace with no declared contents, so
 * it is skipped wherever it appears. Every instance of a position counts
 * together, so "somewhere" means anywhere in the document.
 *
 * The walk fails loudly rather than skipping what it does not understand: a
 * keyword outside the supported set, a `type` that is not a single name, an
 * object with `properties` beside an `anyOf`, an object with both `properties`
 * and object-valued `additionalProperties`, a reference outside
 * `#/definitions/`, and a union variant without a `const` discriminator each
 * throw an Error that names the schema path. A reference cycle is cut short
 * below the property that closes it: that property is recorded, present or
 * absent, and the walk does not descend into the definition that it refers to
 * while the walk is already inside that definition.
 */

export interface JsonSchema {
  $ref?: string
  type?: string | string[]
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  anyOf?: JsonSchema[]
  const?: unknown
  additionalProperties?: boolean | JsonSchema
}

export interface RootSchema extends JsonSchema {
  definitions: Record<string, JsonSchema>
}

export interface RequiredPath {
  path: string
  present: boolean
}

type Shape =
  | { kind: 'leaf' }
  | { kind: 'object'; properties: Record<string, JsonSchema> }
  | { kind: 'array'; element: JsonSchema }
  | { kind: 'map'; element: JsonSchema }
  | { kind: 'union'; variants: JsonSchema[] }

/** Where the walk stands: the schema, its path, and every document value found there. */
interface Cursor {
  schema: JsonSchema
  path: string
  values: readonly unknown[]
}

interface Walk {
  root: RootSchema
  paths: RequiredPath[]
  /** The definitions being entered, innermost last; a repeat ends the descent. */
  active: string[]
}

const LEAF: Shape = { kind: 'leaf' }
const OPEN_NAMESPACE_KEY = 'extensions'
const REFERENCE_PREFIX = '#/definitions/'
const ROOT_POINTER = '#'
const SUPPORTED_KEYWORDS = new Set([
  'type',
  'properties',
  'required',
  'additionalProperties',
  '$ref',
  'description',
  'enum',
  'items',
  'anyOf',
  'const',
])
const ROOT_ONLY_KEYWORDS = new Set(['$schema', '$id', 'title', 'definitions'])
const PATH_SUFFIX = { leaf: '', object: '', union: '', array: '[]', map: '{}' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function referenceName(schema: JsonSchema): string | undefined {
  return schema.$ref?.slice(REFERENCE_PREFIX.length)
}

function mapValueSchema(schema: JsonSchema): JsonSchema | undefined {
  const extra = schema.additionalProperties
  return typeof extra === 'object' && Object.keys(extra).length > 0 ? extra : undefined
}

function childSchemas(schema: JsonSchema, pointer: string): [string, JsonSchema][] {
  const children: [string, JsonSchema][] = []
  for (const [key, property] of Object.entries(schema.properties ?? {})) {
    children.push([`${pointer}/properties/${key}`, property])
  }
  if (schema.items !== undefined) children.push([`${pointer}/items`, schema.items])
  schema.anyOf?.forEach((variant, index) => children.push([`${pointer}/anyOf/${index}`, variant]))
  const entry = mapValueSchema(schema)
  if (entry !== undefined) children.push([`${pointer}/additionalProperties`, entry])
  return children
}

function assertSupportedKeywords(schema: JsonSchema, pointer: string): void {
  for (const keyword of Object.keys(schema)) {
    const supported =
      SUPPORTED_KEYWORDS.has(keyword) ||
      (pointer === ROOT_POINTER && ROOT_ONLY_KEYWORDS.has(keyword))
    if (!supported) {
      throw new Error(`The coverage walk does not support the keyword "${keyword}" at ${pointer}`)
    }
  }
}

function assertSupportedShape(schema: JsonSchema, pointer: string): void {
  assertSupportedKeywords(schema, pointer)
  if (schema.type !== undefined && typeof schema.type !== 'string') {
    throw new Error(`The coverage walk does not support a type list at ${pointer}`)
  }
  if (schema.$ref !== undefined && !schema.$ref.startsWith(REFERENCE_PREFIX)) {
    throw new Error(`The coverage walk does not support the reference ${schema.$ref} at ${pointer}`)
  }
  if (schema.properties !== undefined && schema.anyOf !== undefined) {
    throw new Error(`The coverage walk does not support properties beside anyOf at ${pointer}`)
  }
  if (schema.properties !== undefined && mapValueSchema(schema) !== undefined) {
    throw new Error(
      `The coverage walk does not support properties beside a value schema at ${pointer}`,
    )
  }
}

function assertSupported(schema: JsonSchema, pointer: string): void {
  assertSupportedShape(schema, pointer)
  for (const [childPointer, child] of childSchemas(schema, pointer)) {
    assertSupported(child, childPointer)
  }
}

function assertRootSupported(root: RootSchema): void {
  assertSupported(root, ROOT_POINTER)
  for (const [name, definition] of Object.entries(root.definitions)) {
    assertSupported(definition, `${ROOT_POINTER}/definitions/${name}`)
  }
}

function resolve(schema: JsonSchema, root: RootSchema, trail: readonly string[] = []): JsonSchema {
  const name = referenceName(schema)
  if (name === undefined) return schema
  if (trail.includes(name)) throw new Error(`The definition ${name} refers only to itself`)
  const target = root.definitions[name]
  if (target === undefined) throw new Error(`The schema has no definition named ${name}`)
  return resolve(target, root, [...trail, name])
}

function holdsElements(
  schema: JsonSchema | undefined,
  root: RootSchema,
  seen: readonly string[],
): schema is JsonSchema {
  return schema !== undefined && shapeOf(schema, root, seen).kind !== 'leaf'
}

function containerShape(resolved: JsonSchema, root: RootSchema, seen: readonly string[]): Shape {
  if (resolved.type === 'array') {
    return holdsElements(resolved.items, root, seen)
      ? { kind: 'array', element: resolved.items }
      : LEAF
  }
  const entry = mapValueSchema(resolved)
  if (resolved.properties === undefined && entry === undefined) return LEAF
  if (holdsElements(entry, root, seen)) return { kind: 'map', element: entry }
  return { kind: 'object', properties: resolved.properties ?? {} }
}

function shapeOf(schema: JsonSchema, root: RootSchema, seen: readonly string[] = []): Shape {
  const name = referenceName(schema)
  if (name !== undefined && seen.includes(name)) return LEAF
  const trail = name === undefined ? seen : [...seen, name]
  const resolved = resolve(schema, root)
  const variants = (resolved.anyOf ?? []).filter((variant) => holdsElements(variant, root, trail))
  if (variants.length > 0) return { kind: 'union', variants }
  return resolved.type === 'array' || resolved.type === 'object'
    ? containerShape(resolved, root, trail)
    : LEAF
}

function propertyValues(values: readonly unknown[], key: string): unknown[] {
  return values.filter(isRecord).flatMap((value) => (key in value ? [value[key]] : []))
}

function elementsOf(values: readonly unknown[]): unknown[] {
  return values.flatMap((value) => (Array.isArray(value) ? value : []))
}

function entriesOf(values: readonly unknown[]): unknown[] {
  return values.filter(isRecord).flatMap((value) => Object.values(value))
}

function record(walk: Walk, path: string, present: boolean): void {
  walk.paths.push({ path, present })
}

/** Run the body unless the definition is already being entered, which ends a reference cycle. */
function guarded(schema: JsonSchema, walk: Walk, body: () => void): void {
  const name = referenceName(schema)
  if (name === undefined) return body()
  if (walk.active.includes(name)) return
  walk.active.push(name)
  try {
    body()
  } finally {
    walk.active.pop()
  }
}

function discriminatorOf(variant: JsonSchema): [string, unknown] | undefined {
  const entry = Object.entries(variant.properties ?? {}).find(([, property]) => 'const' in property)
  return entry === undefined ? undefined : [entry[0], entry[1].const]
}

function visitVariants(variants: readonly JsonSchema[], cursor: Cursor, walk: Walk): void {
  const typeName = referenceName(cursor.schema) ?? 'union'
  for (const variant of variants) {
    const discriminator = discriminatorOf(resolve(variant, walk.root))
    if (discriminator === undefined) {
      throw new Error(`A variant of ${typeName} at ${cursor.path} has no const discriminator`)
    }
    const [key, constant] = discriminator
    const matching = cursor.values.filter((value) => isRecord(value) && value[key] === constant)
    const path = `${cursor.path}:${typeName}(${key}=${String(constant)})`
    record(walk, path, matching.length > 0)
    descend({ schema: variant, path, values: matching }, walk)
  }
}

function visitShape(shape: Shape, cursor: Cursor, walk: Walk): void {
  switch (shape.kind) {
    case 'object':
      return visitProperties(shape.properties, cursor, walk)
    case 'union':
      return visitVariants(shape.variants, cursor, walk)
    case 'array':
      return descend({ ...cursor, schema: shape.element, values: elementsOf(cursor.values) }, walk)
    case 'map':
      return descend({ ...cursor, schema: shape.element, values: entriesOf(cursor.values) }, walk)
    case 'leaf':
      return undefined
  }
}

function descend(cursor: Cursor, walk: Walk): void {
  guarded(cursor.schema, walk, () => {
    visitShape(shapeOf(cursor.schema, walk.root), cursor, walk)
  })
}

function presentValues(shape: Shape, values: readonly unknown[]): readonly unknown[] {
  switch (shape.kind) {
    case 'array':
      return elementsOf(values)
    case 'map':
      return entriesOf(values)
    default:
      return values
  }
}

function recordPresence(shape: Shape, cursor: Cursor, walk: Walk): void {
  if (shape.kind === 'union') return
  record(walk, cursor.path, presentValues(shape, cursor.values).length > 0)
}

function visit(cursor: Cursor, walk: Walk): void {
  const shape = shapeOf(cursor.schema, walk.root)
  const here = { ...cursor, path: cursor.path + PATH_SUFFIX[shape.kind] }
  // The property is required even where the descent below it stops on a cycle.
  recordPresence(shape, here, walk)
  guarded(cursor.schema, walk, () => visitShape(shape, here, walk))
}

function visitProperties(properties: Record<string, JsonSchema>, cursor: Cursor, walk: Walk): void {
  for (const [key, schema] of Object.entries(properties)) {
    if (key === OPEN_NAMESPACE_KEY) continue
    const path = cursor.path === '' ? key : `${cursor.path}.${key}`
    visit({ schema, path, values: propertyValues(cursor.values, key) }, walk)
  }
}

/**
 * Every path that the schema requires, each flagged with whether the document
 * carries at least one instance of it.
 */
export function schemaCoverage(schema: RootSchema, document: unknown): RequiredPath[] {
  assertRootSupported(schema)
  const walk: Walk = { root: schema, paths: [], active: [] }
  const cursor = { schema, path: '', values: [document] }
  visitShape(shapeOf(schema, schema), cursor, walk)
  return walk.paths
}

/** The paths that the schema requires and the document lacks. */
export function missingSchemaPaths(schema: RootSchema, document: unknown): string[] {
  return schemaCoverage(schema, document)
    .filter((required) => !required.present)
    .map((required) => required.path)
}
