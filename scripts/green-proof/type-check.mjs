/**
 * Plans and reads the type check of the RED files of a GREEN proof.
 */

const TYPESCRIPT_FILE = /\.(?:ts|tsx|mts|cts)$/
const ERROR_LINE = /^(.+)\((\d+),(\d+)\): error TS\d+: /
const TOOLING_PREFIXES = ['scripts/', '.storybook/']
const DECLARATION_FILE = /\.d\.ts$/
const ROOT_CONFIG = 'tsconfig.json'
const TOOLING_CONFIG = 'tsconfig.tooling.json'

/**
 * @param {string[]} files
 * @returns {{ config: string, files: string[] }[]}
 */
export function typeCheckTargets(files) {
  const typeScriptFiles = files.filter((file) => TYPESCRIPT_FILE.test(file))
  const isTooling = (file) => TOOLING_PREFIXES.some((prefix) => file.startsWith(prefix))
  const tooling = typeScriptFiles.filter(isTooling)
  const rest = typeScriptFiles.filter((file) => !isTooling(file))
  return [
    { config: ROOT_CONFIG, files: rest },
    { config: TOOLING_CONFIG, files: tooling },
  ].filter((group) => group.files.length > 0)
}

/**
 * @param {string} config
 * @param {string[]} files
 * @param {string[]} declarations
 * @returns {string}
 */
export function typeCheckConfigText(config, files, declarations) {
  return JSON.stringify({
    extends: `../${config}`,
    include: [],
    files: [...declarations, ...files].map((file) => `../${file}`),
  })
}

/**
 * @param {string} config
 * @returns {string[]}
 */
export function showConfigArgs(config) {
  return ['exec', 'tsc', '--showConfig', '-p', config]
}

/**
 * @param {string} showConfigText
 * @returns {string[] | null}
 */
export function declarationFiles(showConfigText) {
  let parsed
  try {
    parsed = JSON.parse(showConfigText)
  } catch {
    return null
  }
  if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.files)) return null
  return parsed.files
    .filter((file) => typeof file === 'string' && DECLARATION_FILE.test(file))
    .map((file) => file.replace(/^\.\//, ''))
}

/**
 * @param {number} status
 * @param {string} output
 * @returns {string | null}
 */
export function typeCheckFailure(status, output) {
  const lines = output.split('\n')
  const unlocated = lines.filter((line) => !ERROR_LINE.test(line) && line.includes('error TS'))
  if (unlocated.length > 0) return unlocated.join('\n')
  const hasLocated = lines.some((line) => ERROR_LINE.test(line))
  if (status !== 0 && !hasLocated) return `tsc exited with status ${status}\n${output}`.trim()
  return null
}

/**
 * @param {string} configPath
 * @returns {string[]}
 */
export function tscArgs(configPath) {
  return ['exec', 'tsc', '--noEmit', '--pretty', 'false', '-p', configPath]
}

/**
 * @param {string} output
 * @param {string[]} files
 * @returns {string[]}
 */
export function typeErrorsIn(output, files) {
  return output.split('\n').filter((line) => {
    const match = ERROR_LINE.exec(line)
    return match !== null && files.includes(match[1])
  })
}
