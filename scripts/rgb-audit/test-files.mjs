// scripts/rgb-audit/test-files.mjs
//
// Path classifiers shared by the red-green-blue auditor rules.

const TEST_FILE_PATTERN = /\.test\.(ts|tsx|mjs|js)$/

const SPEC_FILE_PATTERN = /\.spec\.tsx?$/
const STORY_FILE_PATTERN = /\.stories\.tsx$/

const TEST_ASSET_PATTERNS = [
  TEST_FILE_PATTERN,
  SPEC_FILE_PATTERN,
  /-contract\.ts$/,
  /-test-(?:support|kit|fixtures?|setup)\.(?:ts|tsx|mjs)$/,
  /(^|\/)(?:testing|fixtures|__screenshots__)\//,
  /-snapshots\//,
  /fixtures?\.(?:ts|tsx|json|mjs)$/,
  /^(?:tests|e2e)\//,
  STORY_FILE_PATTERN,
  /-story-support\.tsx?$/,
]

/**
 * True when the path is a unit test file.
 *
 * @param {string} path
 * @returns {boolean}
 */
export function isTestFile(path) {
  return TEST_FILE_PATTERN.test(path)
}

/**
 * True when the path is a Playwright or component spec file.
 *
 * @param {string} path
 * @returns {boolean}
 */
export function isSpecFile(path) {
  return SPEC_FILE_PATTERN.test(path)
}

/**
 * True when the path is a Storybook stories file.
 *
 * @param {string} path
 * @returns {boolean}
 */
export function isStoryFile(path) {
  return STORY_FILE_PATTERN.test(path)
}

/**
 * True when the path is a test file or an asset that only tests use: support
 * helpers, fixtures, contracts, stories, snapshots, and end-to-end files.
 *
 * @param {string} path
 * @returns {boolean}
 */
export function isTestAsset(path) {
  return TEST_ASSET_PATTERNS.some((pattern) => pattern.test(path))
}
