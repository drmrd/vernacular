/** Canonical project file name written at the root of each project folder. */
export const PROJECT_FILE = 'vernacular.json'

const SECOND_DOCUMENT_FILE_PATTERN = /^vernacular\.format-([1-9]\d*)\.json$/

/** `vernacular.format-<schemaVersion>.json`, the file a build writes beside a newer main file. */
export function secondDocumentFileName(schemaVersion: number): string {
  return `vernacular.format-${schemaVersion}.json`
}

/** The version in a second document file's name; undefined for any other name. */
export function secondDocumentFileVersion(name: string): number | undefined {
  const match = SECOND_DOCUMENT_FILE_PATTERN.exec(name)
  return match === null ? undefined : Number(match[1])
}
