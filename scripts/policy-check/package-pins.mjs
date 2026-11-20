/** @typedef {import('./commit-rules.mjs').Finding} Finding */
/** @typedef {import('./git-input.mjs').ChangedFile} ChangedFile */
/** @typedef {import('./prose-rules.mjs').ReadFile} ReadFile */

const PACKAGE_JSON = /(^|\/)package\.json$/
const EXACT_VERSION = '\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?'
const EXACT_PIN = new RegExp(`^(?:${EXACT_VERSION}|npm:[^@]+@${EXACT_VERSION})$`)
const DEPENDENCY_SECTIONS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
]

/**
 * One finding per dependency whose version is not an exact pin.
 * @param {readonly ChangedFile[]} changedFiles
 * @param {ReadFile} readFile
 * @returns {Finding[]}
 */
export function exactPinFindings(changedFiles, readFile) {
  const findings = []
  for (const changed of changedFiles) {
    if (changed.status === 'D' || !PACKAGE_JSON.test(changed.path)) continue
    findings.push(...fileFindings(changed.path, readFile(changed.path)))
  }
  return findings
}

/**
 * @param {string} file
 * @param {string} text
 * @returns {Finding[]}
 */
function fileFindings(file, text) {
  let manifest
  try {
    manifest = JSON.parse(text)
  } catch {
    return [{ rule: 'exact-pin', file, message: 'package.json does not parse as JSON' }]
  }
  const findings = []
  for (const { section, dependencies } of dependencySections(manifest)) {
    for (const [name, version] of Object.entries(dependencies)) {
      if (typeof version === 'string' && EXACT_PIN.test(version)) continue
      findings.push({
        rule: 'exact-pin',
        file,
        line: lineOfPackage(text, name),
        message: `${section} pins ${name} to "${version}"; use an exact version`,
      })
    }
  }
  return findings
}

/**
 * @param {Record<string, any>} manifest
 * @returns {{ section: string, dependencies: Record<string, unknown> }[]}
 */
function dependencySections(manifest) {
  const sections = DEPENDENCY_SECTIONS.map((section) => ({
    section,
    dependencies: manifest?.[section],
  }))
  sections.push({ section: 'pnpm.overrides', dependencies: manifest?.pnpm?.overrides })
  return sections.filter(({ dependencies }) => isRecord(dependencies))
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * @param {string} text
 * @param {string} name
 * @returns {number | undefined}
 */
function lineOfPackage(text, name) {
  const index = text.split('\n').findIndex((line) => line.includes(`"${name}":`))
  return index === -1 ? undefined : index + 1
}
