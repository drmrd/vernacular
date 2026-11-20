/** @typedef {import('./rule-severity.mjs').Finding} Finding */
/** @typedef {import('./git-input.mjs').ChangedFile} ChangedFile */
/** @typedef {import('./git-input.mjs').ReadFile} ReadFile */

const PACKAGE_JSON = /(^|\/)package\.json$/
const EXACT_VERSION = '\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?'
const EXACT_PIN = new RegExp(
  `^(?:${EXACT_VERSION}|npm:(?:@[a-z0-9][\\w.-]*\\/)?[a-z0-9][\\w.-]*@${EXACT_VERSION})$`,
)
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
  const lines = text.split('\n')
  const findings = []
  for (const { section, dependencies } of dependencySections(manifest)) {
    for (const [name, version] of Object.entries(dependencies)) {
      if (typeof version === 'string' && EXACT_PIN.test(version)) continue
      findings.push({
        rule: 'exact-pin',
        file,
        line: lineOfEntry(lines, section, name),
        message: `${section} entry ${name} is ${JSON.stringify(version)}, not an exact version; pin it exactly`,
      })
    }
  }
  return findings
}

/**
 * @param {unknown} manifest
 * @returns {{ section: string, dependencies: Record<string, unknown> }[]}
 */
function dependencySections(manifest) {
  const root = isRecord(manifest) ? manifest : {}
  const pnpm = isRecord(root.pnpm) ? root.pnpm : {}
  /** @type {{ section: string, dependencies: unknown }[]} */
  const sections = DEPENDENCY_SECTIONS.map((section) => ({
    section,
    dependencies: root[section],
  }))
  sections.push({ section: 'pnpm.overrides', dependencies: pnpm.overrides })
  return sections.filter(
    /** @returns {entry is { section: string, dependencies: Record<string, unknown> }} */
    (entry) => isRecord(entry.dependencies),
  )
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Line of the entry inside its own section, so a same-named key elsewhere is skipped.
 * @param {readonly string[]} lines
 * @param {string} section
 * @param {string} name
 * @returns {number | undefined}
 */
function lineOfEntry(lines, section, name) {
  let start = 0
  for (const key of [...section.split('.'), name]) {
    const index = lines.findIndex((line, at) => at >= start && line.includes(`"${key}":`))
    if (index === -1) return undefined
    start = index
  }
  return start + 1
}
