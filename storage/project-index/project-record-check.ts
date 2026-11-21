import type { ProjectRecord } from './project-index'

type Fields = Record<string, unknown>

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null
}

function isStringOrUndefined(value: unknown): boolean {
  return value === undefined || typeof value === 'string'
}

function isLocation(value: unknown): boolean {
  if (!isFields(value)) return false
  if (value['kind'] === 'workspace') return true
  return value['kind'] === 'folder' && typeof value['folderName'] === 'string'
}

function isLastOpen(value: unknown): boolean {
  if (!isFields(value)) return false
  return (
    typeof value['opened'] === 'boolean' &&
    typeof value['build'] === 'string' &&
    isStringOrUndefined(value['reason'])
  )
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function hasOptionalTexts(value: Fields): boolean {
  return (
    isStringOrUndefined(value['name']) &&
    isStringOrUndefined(value['preview']) &&
    isStringOrUndefined(value['lastChangedAt']) &&
    isStringOrUndefined(value['lastUsedAt'])
  )
}

/** True when a stored value has the shape of a project record. Extra fields are accepted. */
export function isProjectRecord(value: unknown): value is ProjectRecord {
  if (!isFields(value)) return false
  return (
    typeof value['id'] === 'string' &&
    isLocation(value['location']) &&
    hasOptionalTexts(value) &&
    (value['floorCount'] === undefined || typeof value['floorCount'] === 'number') &&
    isStringArray(value['assetHashes']) &&
    typeof value['assetListComplete'] === 'boolean' &&
    isLastOpen(value['lastOpen'])
  )
}
