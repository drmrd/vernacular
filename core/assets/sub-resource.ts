import {
  formatCatalogId,
  lowercaseWordPattern,
  lowercaseWordProblem,
  missingPartProblem,
  parseCatalogId,
  type CatalogId,
} from './catalog-id.ts'

export const SUB_RESOURCE_KINDS = [
  'slot',
  'socket',
  'port',
  'lod',
  'layer',
  'node',
  'zone',
  'volume',
  'morph',
  'rule',
  'stream',
  'void',
] as const

export type SubResourceKind = (typeof SUB_RESOURCE_KINDS)[number]

export interface SubResource {
  kind: SubResourceKind
  name: string
}

export type SubResourceParse =
  | { ok: true; id: CatalogId; part: SubResource }
  | { ok: false; problem: string }

type SubResourcePartParse = { ok: true; part: SubResource } | { ok: false; problem: string }

export const SUB_RESOURCE_SEPARATOR = '~'
const KIND_NAME_SEPARATOR = ':'
const ASSET_REFERENCE_SEPARATOR = '#'

const NAME_MIN_LENGTH = 2
const NAME_MAX_LENGTH = 48
const NAME_PATTERN = lowercaseWordPattern(NAME_MIN_LENGTH, NAME_MAX_LENGTH)

const NAME_PROBLEM = lowercaseWordProblem('name', NAME_MIN_LENGTH, NAME_MAX_LENGTH)
const KIND_PROBLEM = `kind must be one of ${SUB_RESOURCE_KINDS.join(', ')}`
const ASSET_REFERENCE_PROBLEM = `a sub-resource text holds no "${ASSET_REFERENCE_SEPARATOR}", so it is never read as an asset reference`

function isSubResourceKind(kind: string): kind is SubResourceKind {
  return (SUB_RESOURCE_KINDS as readonly string[]).includes(kind)
}

export function isSubResourceName(name: string): boolean {
  return NAME_PATTERN.test(name)
}

/** Does not validate: trusts the caller to pass a valid id and part, as `formatCatalogId` does. */
export function formatSubResource(id: CatalogId, part: SubResource): string {
  return `${formatCatalogId(id)}${SUB_RESOURCE_SEPARATOR}${part.kind}${KIND_NAME_SEPARATOR}${part.name}`
}

function parseSubResourcePart(text: string): SubResourcePartParse {
  const separatorIndex = text.indexOf(KIND_NAME_SEPARATOR)
  if (separatorIndex === -1) {
    return { ok: false, problem: missingPartProblem('name', KIND_NAME_SEPARATOR, 'kind') }
  }
  const kind = text.slice(0, separatorIndex)
  const name = text.slice(separatorIndex + 1)
  if (!isSubResourceKind(kind)) return { ok: false, problem: KIND_PROBLEM }
  if (!isSubResourceName(name)) return { ok: false, problem: NAME_PROBLEM }
  return { ok: true, part: { kind, name } }
}

export function parseSubResourceText(text: string): SubResourceParse {
  if (text.includes(ASSET_REFERENCE_SEPARATOR)) {
    return { ok: false, problem: ASSET_REFERENCE_PROBLEM }
  }
  const separatorIndex = text.lastIndexOf(SUB_RESOURCE_SEPARATOR)
  if (separatorIndex === -1) {
    return {
      ok: false,
      problem: missingPartProblem('kind', SUB_RESOURCE_SEPARATOR, 'catalog identifier'),
    }
  }
  const idParse = parseCatalogId(text.slice(0, separatorIndex))
  if (!idParse.ok) return idParse
  const partParse = parseSubResourcePart(text.slice(separatorIndex + 1))
  return partParse.ok ? { ok: true, id: idParse.id, part: partParse.part } : partParse
}
