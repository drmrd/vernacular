import { createDocumentValidator } from '../../core'

/*
 * Derives, from a published schema alone, the element kinds that a document
 * must carry for a fixture to exercise the whole format of that version.
 *
 * A kind is one of:
 *   - a collection of objects (an array or an open map of objects) that holds
 *     at least one element somewhere in the document;
 *   - an object-shaped variant of a union, identified by its `const`
 *     discriminator when it has one and by the variant it satisfies otherwise;
 *   - an object-valued property, required or optional, including an open map
 *     of plain values such as `meta.registryVersions`.
 *
 * The `extensions` map is an open namespace with no defined kinds, so it is
 * skipped wherever it appears. Paths read `floors[].walls[]` for a collection
 * in an array, `paint{}` for one in an open map, and
 * `paint{}:SurfaceTreatment(kind=pattern)` for a variant of a union.
 */

export interface JsonSchema {
  $ref?: string
  type?: string
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  anyOf?: JsonSchema[]
  const?: unknown
  additionalProperties?: boolean | JsonSchema
}

export interface RootSchema extends JsonSchema {
  definitions: Record<string, JsonSchema>
}

export interface ElementKind {
  path: string
  present: boolean
}

type Shape = 'union' | 'array' | 'map' | 'object' | 'leaf'

/** Where the walk stands: the schema, its path, and every document value found there. */
interface Cursor {
  schema: JsonSchema
  path: string
  values: readonly unknown[]
}

interface Walk {
  root: RootSchema
  kinds: ElementKind[]
}

const OPEN_NAMESPACE_KEY = 'extensions'
const REFERENCE_PREFIX = '#/definitions/'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function referenceName(schema: JsonSchema): string | undefined {
  return schema.$ref?.slice(REFERENCE_PREFIX.length)
}

function resolve(schema: JsonSchema, root: RootSchema): JsonSchema {
  const name = referenceName(schema)
  if (name === undefined) return schema
  const target = root.definitions[name]
  if (target === undefined) throw new Error(`The schema has no definition named ${name}`)
  return resolve(target, root)
}

function mapValueSchema(schema: JsonSchema): JsonSchema | undefined {
  const extra = schema.additionalProperties
  return typeof extra === 'object' && Object.keys(extra).length > 0 ? extra : undefined
}

function holdsElements(schema: JsonSchema | undefined, root: RootSchema): boolean {
  return schema !== undefined && shapeOf(schema, root) !== 'leaf'
}

function shapeOf(schema: JsonSchema, root: RootSchema): Shape {
  const resolved = resolve(schema, root)
  if (resolved.anyOf?.some((variant) => holdsElements(variant, root))) return 'union'
  if (resolved.type === 'array') return holdsElements(resolved.items, root) ? 'array' : 'leaf'
  if (resolved.type !== 'object') return 'leaf'
  const entrySchema = mapValueSchema(resolved)
  if (resolved.properties === undefined && entrySchema === undefined) return 'leaf'
  return holdsElements(entrySchema, root) ? 'map' : 'object'
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
  walk.kinds.push({ path, present })
}

function visitProperties(cursor: Cursor, walk: Walk): void {
  const properties = resolve(cursor.schema, walk.root).properties ?? {}
  for (const [key, schema] of Object.entries(properties)) {
    if (key === OPEN_NAMESPACE_KEY) continue
    const path = cursor.path === '' ? key : `${cursor.path}.${key}`
    visit({ schema, path, values: propertyValues(cursor.values, key) }, walk)
  }
}

function discriminatorOf(variant: JsonSchema): [string, unknown] | undefined {
  const entry = Object.entries(variant.properties ?? {}).find(([, property]) => 'const' in property)
  return entry === undefined ? undefined : [entry[0], entry[1].const]
}

function variantLabel(variant: JsonSchema, typeName: string, index: number): string {
  const discriminator = discriminatorOf(variant)
  return discriminator === undefined
    ? `${typeName}(variant ${index + 1})`
    : `${typeName}(${discriminator[0]}=${String(discriminator[1])})`
}

function valuesOfVariant(
  variant: JsonSchema,
  values: readonly unknown[],
  root: RootSchema,
): unknown[] {
  const discriminator = discriminatorOf(variant)
  if (discriminator !== undefined) {
    return values.filter((value) => isRecord(value) && value[discriminator[0]] === discriminator[1])
  }
  const satisfies = createDocumentValidator({ ...variant, definitions: root.definitions })
  return values.filter((value) => satisfies(value).valid)
}

function visitUnion(cursor: Cursor, walk: Walk): void {
  const typeName = referenceName(cursor.schema) ?? 'union'
  const variants = resolve(cursor.schema, walk.root).anyOf ?? []
  variants.forEach((variant, index) => {
    if (!holdsElements(variant, walk.root)) return
    const matching = valuesOfVariant(variant, cursor.values, walk.root)
    const path = `${cursor.path}:${variantLabel(variant, typeName, index)}`
    record(walk, path, matching.length > 0)
    visitShape({ schema: variant, path, values: matching }, walk)
  })
}

function visitShape(cursor: Cursor, walk: Walk): void {
  const schema = resolve(cursor.schema, walk.root)
  switch (shapeOf(schema, walk.root)) {
    case 'union':
      return visitUnion(cursor, walk)
    case 'object':
      return visitProperties(cursor, walk)
    case 'array':
      return visitShape(
        { ...cursor, schema: schema.items as JsonSchema, values: elementsOf(cursor.values) },
        walk,
      )
    case 'map':
      return visitShape(
        {
          ...cursor,
          schema: mapValueSchema(schema) as JsonSchema,
          values: entriesOf(cursor.values),
        },
        walk,
      )
    case 'leaf':
      return undefined
  }
}

function visit(cursor: Cursor, walk: Walk): void {
  const shape = shapeOf(cursor.schema, walk.root)
  if (shape === 'object') record(walk, cursor.path, cursor.values.length > 0)
  if (shape === 'array') record(walk, `${cursor.path}[]`, elementsOf(cursor.values).length > 0)
  if (shape === 'map') record(walk, `${cursor.path}{}`, entriesOf(cursor.values).length > 0)
  const suffix = { array: '[]', map: '{}', object: '', union: '', leaf: '' }[shape]
  visitShape({ ...cursor, path: cursor.path + suffix }, walk)
}

/**
 * Every element kind that the schema defines, each flagged with whether the
 * document carries at least one instance of it.
 */
export function elementKindCoverage(schema: RootSchema, document: unknown): ElementKind[] {
  const walk: Walk = { root: schema, kinds: [] }
  visitShape({ schema, path: '', values: [document] }, walk)
  return walk.kinds
}

/** The paths of the element kinds that the schema defines and the document lacks. */
export function missingElementKinds(schema: RootSchema, document: unknown): string[] {
  return elementKindCoverage(schema, document)
    .filter((kind) => !kind.present)
    .map((kind) => kind.path)
}
