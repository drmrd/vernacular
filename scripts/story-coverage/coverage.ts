import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// The story-coverage guardrail walks the React layers and flags any component
// module that lacks a co-located story and is not recorded on the tolerated
// allowlist. It mirrors the fs-walk idiom of the css-literal-guard test:
// recurse the tree with readdirSync, classify files by their source text, and
// report deterministic, sorted absolute paths. No AST dependency; a regex over
// the file text is the component signal (ADR-0111).

const COMPONENT_FILE_EXTENSION = '.tsx'
const STORY_FILE_SUFFIX = '.stories.tsx'
const TEST_FILE_SUFFIX = '.test.tsx'
const SPEC_FILE_SUFFIX = '.spec.tsx'

// An exported PascalCase function or const is a component. A leading lowercase
// identifier is a helper, and a `use[A-Z]` identifier is a hook; neither is a
// component. Type/interface/enum exports never make a file a component module.
const EXPORTED_COMPONENT_PATTERNS = [
  /export\s+function\s+[A-Z]\w*/,
  /export\s+const\s+[A-Z]\w*\s*=/,
  /export\s+default\s+function\s+[A-Z]\w*/,
]

const HOOK_EXPORT_PATTERNS = [
  /export\s+function\s+use[A-Z]\w*/,
  /export\s+const\s+use[A-Z]\w*\s*=/,
  /export\s+default\s+function\s+use[A-Z]\w*/,
]

function tsxFilesUnder(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...tsxFilesUnder(path))
    } else if (entry.isFile() && isComponentCandidate(entry.name)) {
      files.push(path)
    }
  }
  return files
}

function isComponentCandidate(name: string): boolean {
  if (!name.endsWith(COMPONENT_FILE_EXTENSION)) {
    return false
  }
  return (
    !name.endsWith(STORY_FILE_SUFFIX) &&
    !name.endsWith(TEST_FILE_SUFFIX) &&
    !name.endsWith(SPEC_FILE_SUFFIX)
  )
}

function exportsComponent(file: string): boolean {
  const source = readFileSync(file, 'utf8')
  const isComponentLine = (line: string): boolean =>
    EXPORTED_COMPONENT_PATTERNS.some((pattern) => pattern.test(line)) &&
    !HOOK_EXPORT_PATTERNS.some((pattern) => pattern.test(line))
  return source.split('\n').some(isComponentLine)
}

function hasSiblingStory(file: string): boolean {
  const storyPath = file.slice(0, -COMPONENT_FILE_EXTENSION.length) + STORY_FILE_SUFFIX
  return existsSync(storyPath)
}

export function findUncoveredComponentModules(options: { roots: string[]; allowlist: string[] }): {
  unlisted: string[]
  staleCovered: string[]
  staleMissing: string[]
} {
  const allowlist = new Set(options.allowlist)
  const componentModules = options.roots
    .flatMap((root) => tsxFilesUnder(root))
    .filter((file) => exportsComponent(file))

  const unlisted = componentModules
    .filter((file) => !hasSiblingStory(file) && !allowlist.has(file))
    .sort()

  const staleCovered = options.allowlist.filter((file) => hasSiblingStory(file)).sort()

  const staleMissing = options.allowlist.filter((file) => !existsSync(file)).sort()

  return { unlisted, staleCovered, staleMissing }
}
