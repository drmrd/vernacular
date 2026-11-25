/** Canonical project file name written at the root of each project folder. */
export const PROJECT_FILE = 'vernacular.json'

const SECOND_DOCUMENT_FILE_PREFIX = 'vernacular.format-'

const VERSION_AND_EXTENSION_PATTERN = /^([1-9]\d*)\.json$/

/** `vernacular.format-<schemaVersion>.json`, the file a build writes beside a newer main file. */
export function secondDocumentFileName(schemaVersion: number): string {
  return `${SECOND_DOCUMENT_FILE_PREFIX}${schemaVersion}.json`
}

/** The version in a second document file's name; undefined for any other name. */
export function secondDocumentFileVersion(name: string): number | undefined {
  if (!name.startsWith(SECOND_DOCUMENT_FILE_PREFIX)) {
    return undefined
  }
  const match = VERSION_AND_EXTENSION_PATTERN.exec(name.slice(SECOND_DOCUMENT_FILE_PREFIX.length))
  return match === null ? undefined : Number(match[1])
}
