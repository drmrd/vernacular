// @vitest-environment node
// ESLint's lintText reads files through Node's fs module, which needs the node environment, not the project-wide jsdom.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint, type Linter } from 'eslint'
import { describe, expect, it } from 'vitest'
import { lintConfig } from './lint-config-module'

// One shared instance: building the flat config is the expensive part. Linting is
// CPU-bound, so allow extra time over Vitest's 5s per-test default.
const eslint = new ESLint()
const LINT_TIMEOUT_MS = 30_000
// Reading about 1,500 source files to scan their comments outlasts the default limit under load.
const SOURCE_SCAN_TIMEOUT_MS = 30_000

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))

const STORAGE_MESSAGE_TEXT = 'storage/'
const GLOBAL_RULE = 'no-restricted-globals'
const STORAGE_RULES = [GLOBAL_RULE, 'no-restricted-properties', 'no-restricted-syntax']
const STORAGE_API_NAMES = [
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'caches',
  'showDirectoryPicker',
  'showOpenFilePicker',
  'showSaveFilePicker',
]
const GLOBAL_OBJECTS = ['window', 'globalThis', 'self']

/** A sample text and the file name that it is linted under. */
type Row = [source: string, filePath: string]

async function lintMessages(source: string, filePath: string): Promise<Linter.LintMessage[]> {
  const [result] = await eslint.lintText(`${source}\n`, { filePath })
  const messages = result?.messages ?? []
  const parseFailure = messages.find((message) => message.fatal === true)
  if (parseFailure !== undefined) {
    throw new Error(`${filePath} did not parse: ${parseFailure.message}`)
  }
  return messages
}

async function storageMessages(source: string, filePath: string): Promise<string[]> {
  const messages = await lintMessages(source, filePath)
  return messages
    .map((message) => message.message)
    .filter((text) => text.includes(STORAGE_MESSAGE_TEXT))
}

async function globalRuleMessages(source: string, filePath: string): Promise<string[]> {
  const messages = await lintMessages(source, filePath)
  return messages
    .filter((message) => message.ruleId === GLOBAL_RULE)
    .map((message) => message.message)
}

function rows(sources: readonly string[], filePaths: readonly string[]): Row[] {
  return filePaths.flatMap((filePath) => sources.map((source): Row => [source, filePath]))
}

function bareUse(name: string): string {
  return `export const value = ${name}`
}

const SOURCE_FILE_PATTERN = /\.tsx?$/
const DISABLE_DIRECTIVE = /eslint-disable(?:-next-line|-line)?([^\n]*)/g
// The six layers under the rule, and the folder of the application entry points. Not storage/.
const FOLDERS_UNDER_THE_RULE = ['app', 'bridge', 'core', 'editor', 'engine', 'session', 'src']

/** Every `.ts` and `.tsx` file of the folders under the rule, by its path from the repository root. */
function sourcesUnderTheRule(): Map<string, string> {
  const sources = new Map<string, string>()
  for (const folder of FOLDERS_UNDER_THE_RULE) {
    const entries = readdirSync(join(repositoryRoot, folder), {
      recursive: true,
      withFileTypes: true,
    })
    for (const entry of entries.filter((e) => e.isFile() && SOURCE_FILE_PATTERN.test(e.name))) {
      const file = join(entry.parentPath, entry.name)
      sources.set(relative(repositoryRoot, file).split(sep).join('/'), readFileSync(file, 'utf8'))
    }
  }
  return sources
}

function disablesStorageRule(text: string): boolean {
  return [...text.matchAll(DISABLE_DIRECTIVE)].some(([, rest]) => {
    const named = (rest ?? '').split('--')[0] ?? ''
    const bare = named.replace('*/', '').trim() === ''
    return bare || STORAGE_RULES.some((rule) => named.includes(rule))
  })
}

function filesDisablingStorageRules(sources: Map<string, string>): string[] {
  return [...sources].filter(([, text]) => disablesStorageRule(text)).map(([path]) => path)
}

const STORAGE_USES = [
  "export const value = localStorage.getItem('x')",
  'export const value = globalThis.localStorage',
  'export const value = window.indexedDB',
  'export const value = navigator.storage.getDirectory()',
  'export const value = navigator.locks.request',
]

const FILES_UNDER_THE_RULE = [
  'core/sample.ts',
  'session/sample.ts',
  'engine/sample.ts',
  'bridge/sample.tsx',
  'editor/sample.tsx',
  'app/sample.tsx',
  'src/sample.tsx',
  'editor/sample.test.tsx',
  'editor/sample.stories.tsx',
  'core/sample.test.ts',
  'session/sample.test.ts',
]

const FILES_OUTSIDE_THE_RULE = [
  'storage/sample.ts',
  'storage/sample.test.ts',
  'e2e/tests/sample.spec.ts',
  'tests/storage/sample.browser.test.ts',
]

const OBJECT_PROPERTY_USES = GLOBAL_OBJECTS.flatMap((object) =>
  STORAGE_API_NAMES.map((name) => `export const value = ${object}.${name}`),
)

const BRACKET_AND_DESTRUCTURING_OF_WINDOW = [
  "export const value = window['localStorage']",
  'const { localStorage: store } = window; export const value = store',
]

const OPTIONAL_CHAINING_AND_DESTRUCTURING_OF_NAVIGATOR = [
  'export const value = navigator?.storage',
  'const { storage } = navigator; export const value = storage',
]

const NAVIGATOR_THROUGH_AN_OBJECT_USES = [
  'export const value = globalThis.navigator.storage',
  'export const value = window.navigator.locks',
  'export const value = globalThis.navigator?.storage',
  "export const value = self.navigator['storage']",
]

const LOOK_ALIKES = [
  "import { vi } from 'vitest'; vi.stubGlobal('localStorage', {})",
  'export const value = { storage: 1, locks: 2 }',
  'const ports = { locks: 1 }; export const value = ports.locks',
  'export const value = navigator.clipboard',
  'export const value = globalThis.navigator?.serviceWorker',
  'export type Held = Storage',
]

const SHADOWED_NAMES = [
  'export function read(caches: string): string { return caches }',
  'export function read(): number { const caches = 1; return caches }',
]

const WINDOW_USE = 'export const value = window'

async function expectRejected(source: string, filePath: string): Promise<void> {
  expect(await storageMessages(source, filePath)).not.toEqual([])
}

async function expectAccepted(source: string, filePath: string): Promise<void> {
  expect(await storageMessages(source, filePath)).toEqual([])
}

describe('storage globals outside storage: where the rule applies', () => {
  it.each(rows(STORAGE_USES, FILES_UNDER_THE_RULE))(
    'rejects %s in %s with a message that points at storage/',
    { timeout: LINT_TIMEOUT_MS },
    expectRejected,
  )

  it.each(rows(STORAGE_USES, FILES_OUTSIDE_THE_RULE))(
    'accepts %s in %s',
    { timeout: LINT_TIMEOUT_MS },
    expectAccepted,
  )
})

describe('storage globals outside storage: the ways a name is reached', () => {
  it.each(rows(STORAGE_API_NAMES.map(bareUse), ['editor/sample.tsx']))(
    'rejects the bare name in %s in %s',
    { timeout: LINT_TIMEOUT_MS },
    expectRejected,
  )

  it.each(rows(OBJECT_PROPERTY_USES, ['app/sample.tsx']))(
    'rejects a name read from the global object in %s in %s',
    { timeout: LINT_TIMEOUT_MS },
    expectRejected,
  )

  it.each(rows(BRACKET_AND_DESTRUCTURING_OF_WINDOW, ['app/sample.tsx']))(
    'rejects a text in brackets and a destructuring of window in %s in %s',
    { timeout: LINT_TIMEOUT_MS },
    expectRejected,
  )

  it.each(rows(OPTIONAL_CHAINING_AND_DESTRUCTURING_OF_NAVIGATOR, ['app/sample.tsx']))(
    'rejects optional chaining and a destructuring of navigator in %s in %s',
    { timeout: LINT_TIMEOUT_MS },
    expectRejected,
  )

  it.each(rows(NAVIGATOR_THROUGH_AN_OBJECT_USES, ['app/sample.tsx']))(
    'rejects navigator reached through another object in %s in %s',
    { timeout: LINT_TIMEOUT_MS },
    expectRejected,
  )
})

describe('storage globals outside storage: things that look alike', () => {
  it.each(rows(LOOK_ALIKES, ['editor/sample.test.tsx']))(
    'accepts the look-alike %s in %s',
    { timeout: LINT_TIMEOUT_MS },
    expectAccepted,
  )

  it.each(rows(SHADOWED_NAMES, ['editor/sample.tsx']))(
    'accepts a name that is a parameter or a local variable in %s in %s',
    { timeout: LINT_TIMEOUT_MS },
    expectAccepted,
  )
})

describe('storage globals outside storage: the layer purity rules stay whole', () => {
  it.each(['core', 'session'])(
    'a shipped %s file still names its layer for the global window',
    { timeout: LINT_TIMEOUT_MS },
    async (layer) => {
      const messages = await globalRuleMessages(WINDOW_USE, `${layer}/sample.ts`)
      expect(messages.join('\n')).toContain(`${layer}/`)
    },
  )

  it.each(['core', 'session'])(
    'a %s test file may still use window',
    { timeout: LINT_TIMEOUT_MS },
    async (layer) => {
      expect(await globalRuleMessages(WINDOW_USE, `${layer}/sample.test.ts`)).toEqual([])
    },
  )
})

describe('storage globals outside storage: no way around the rule', () => {
  it('no entry of the exception list names one of the three storage rules', () => {
    const named = lintConfig.lintExceptions.filter(
      (entry) => entry.rule !== undefined && STORAGE_RULES.includes(entry.rule),
    )

    expect(named.map((entry) => `${entry.file} (${entry.rule})`)).toEqual([])
  })

  it(
    'no file of the seven folders disables one of the three storage rules in a comment',
    { timeout: SOURCE_SCAN_TIMEOUT_MS },
    () => {
      const sources = sourcesUnderTheRule()

      expect([...sources.keys()], 'sources read').toEqual(
        expect.arrayContaining(['core/index.ts', 'src/main.tsx']),
      )
      expect(filesDisablingStorageRules(sources)).toEqual([])
    },
  )
})
