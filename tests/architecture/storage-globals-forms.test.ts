// @vitest-environment node
// ESLint's lintText reads files through Node's fs module, which needs the node environment, not the project-wide jsdom.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  LINT_TIMEOUT_MS,
  STORAGE_API_NAMES,
  disablesStorageRule,
  expectAccepted,
  expectRejected,
  globalRuleMessages,
  repositoryRoot,
  rows,
  type Row,
} from './storage-globals-test-kit'

const DESTRUCTURINGS_THROUGH_AN_OBJECT = [
  'const { storage } = globalThis.navigator; export const value = storage',
  'const { locks } = window.navigator; export const value = locks',
  'const { storage: held } = self.navigator; export const value = held',
  'const { navigator: { storage } } = globalThis; export const value = storage',
  'const { navigator: { locks: held } } = window; export const value = held',
]

const TYPESCRIPT_WRAPPERS = [
  'export const value = (window as Window).localStorage',
  'export const value = (globalThis as typeof globalThis).indexedDB',
  'export const value = (window satisfies Window).localStorage',
  'export const value = window!.localStorage',
  'export const value = navigator!.storage',
  'export const value = globalThis.navigator!.storage',
  'export const value = (navigator as Navigator).storage',
  'export const value = (navigator as Navigator).locks',
]

const ONE_OF_EACH_FORM = [
  'const { storage } = globalThis.navigator; export const value = storage',
  'export const value = (globalThis as typeof globalThis).indexedDB',
  'export const value = (navigator as Navigator).locks',
]

const LOOK_ALIKES = [
  'const { clipboard } = globalThis.navigator; export const value = clipboard',
  'const { navigator: { clipboard } } = globalThis; export const value = clipboard',
  'export const value = { navigator: { storage: 1, locks: 2 } }',
  'function f({ navigator: { storage } }: { navigator: { storage: number } }) { return storage }',
  'export const value = (navigator as Navigator).clipboard',
  'export const value = (window as Window).document',
  'export type Held = typeof window.localStorage',
]

const ENV = 'const env = { navigator: { storage: 1 } }'

const NAVIGATOR_MEMBERS_OF_A_PLAIN_OBJECT = [
  `${ENV}; export const value = env.navigator.storage`,
  "const env = { navigator: { locks: 1 } }; export const value = env.navigator['locks']",
  `${ENV}; export const value = env.navigator?.storage`,
  `${ENV}; const { storage } = env.navigator; export const value = storage`,
  'export class Host { navigator = { storage: 1 }; read(): number { const { storage } = this.navigator; return storage } }',
  'export class Host { navigator = { locks: 1 }; read(): number { return this.navigator.locks } }',
  'export function read(props: { navigator: { locks: number } }): number { return props.navigator.locks }',
  `${ENV}; export const value = (env.navigator as { storage: number }).storage`,
  `${ENV}; export const value = env.navigator!.storage`,
]

const NAVIGATOR_OF_A_GLOBAL_OBJECT_BEHIND_A_WRAPPER = [
  'export const value = (globalThis as typeof globalThis).navigator.storage',
  'export const value = (window as Window).navigator.locks',
  'export const value = window!.navigator.storage',
  'export const value = (window as Window).navigator!.locks',
  'const { storage } = (globalThis as typeof globalThis).navigator; export const value = storage',
]

const PLAIN_SCRIPT_FILES = ['app/sample.js', 'app/sample.mjs']
const NAVIGATOR_STORAGE = 'export const value = navigator.storage'
const LOCAL_STORAGE = 'export const value = localStorage'
const NAVIGATOR_THROUGH_THE_GLOBAL_OBJECT: Row[] = [
  ['export const value = window.navigator.storage', 'core/sample.ts'],
  ['export const value = self.navigator?.locks', 'app/sample.tsx'],
]
const SERVICE_WORKER_PATH = 'src/service-worker.ts'

const COMMENTS_THAT_DISABLE_THE_RULES = [
  '/* eslint-disable */',
  '// eslint-disable-line',
  '// eslint-disable-next-line a, no-restricted-syntax -- why',
  '/* eslint-disable no-restricted-globals */',
  '/* eslint no-restricted-globals: "off" */',
  '/* eslint no-restricted-properties: 0 */',
]

const COMMENTS_THAT_DO_NOT = [
  '/* eslint-disable max-lines -- no-restricted-globals is a name in the reason */',
  '/* eslint max-lines: "off" -- no-restricted-syntax is a name in the reason */',
  '// ESLint reports this through the rule for restricted globals',
  '/* eslint is the linter of this repository */',
]

describe('storage globals outside storage: forms that hide a use', () => {
  it.each(rows(DESTRUCTURINGS_THROUGH_AN_OBJECT, ['app/sample.tsx']))(
    'rejects a destructuring of the storage or locks member through an object in %s in %s',
    { timeout: LINT_TIMEOUT_MS },
    expectRejected,
  )

  it.each(rows(TYPESCRIPT_WRAPPERS, ['app/sample.tsx']))(
    'rejects a use behind a TypeScript cast or non-null mark in %s in %s',
    { timeout: LINT_TIMEOUT_MS },
    expectRejected,
  )

  it.each(rows(ONE_OF_EACH_FORM, ['core/sample.ts', 'editor/sample.test.tsx']))(
    'rejects one of each form in %s in %s',
    { timeout: LINT_TIMEOUT_MS },
    expectRejected,
  )

  it.each(rows(LOOK_ALIKES, ['app/sample.tsx']))(
    'accepts the look-alike %s in %s',
    { timeout: LINT_TIMEOUT_MS },
    expectAccepted,
  )

  it(
    'accepts the real service worker file, which hands its cache storage to storage/',
    {
      timeout: LINT_TIMEOUT_MS,
    },
    async () => {
      const source = readFileSync(join(repositoryRoot, SERVICE_WORKER_PATH), 'utf8')

      await expectAccepted(source, SERVICE_WORKER_PATH)
    },
  )
})

describe('storage globals outside storage: a navigator member counts only on a global object', () => {
  it.each(rows(NAVIGATOR_MEMBERS_OF_A_PLAIN_OBJECT, ['app/sample.tsx']))(
    'accepts a storage or locks member of a plain object named navigator in %s in %s',
    { timeout: LINT_TIMEOUT_MS },
    expectAccepted,
  )

  it.each(
    rows(NAVIGATOR_MEMBERS_OF_A_PLAIN_OBJECT.slice(0, 1), [
      'editor/sample.test.tsx',
      'core/sample.ts',
    ]),
  )(
    'accepts a navigator member of a plain object in a test file and in a shipped core file in %s in %s',
    { timeout: LINT_TIMEOUT_MS },
    expectAccepted,
  )

  it.each(rows(NAVIGATOR_OF_A_GLOBAL_OBJECT_BEHIND_A_WRAPPER, ['app/sample.tsx']))(
    'rejects navigator read from a global object behind a cast or non-null mark in %s in %s',
    { timeout: LINT_TIMEOUT_MS },
    expectRejected,
  )
})

describe('storage globals outside storage: the rule keeps its reach', () => {
  it.each(
    rows(
      STORAGE_API_NAMES.map((name) => `export const value = ${name}`),
      ['core/sample.ts', 'session/sample.ts'],
    ),
  )(
    'gives the storage message and not the layer message for the bare name in %s in %s',
    { timeout: LINT_TIMEOUT_MS },
    async (source, filePath) => {
      const layer = filePath.split('/')[0]

      await expectRejected(source, filePath)
      expect((await globalRuleMessages(source, filePath)).join('\n')).not.toContain(`${layer}/`)
    },
  )

  it(
    'a shipped core file still names its layer for the global document',
    { timeout: LINT_TIMEOUT_MS },
    async () => {
      const messages = await globalRuleMessages('export const value = document', 'core/sample.ts')

      expect(messages.join('\n')).toContain('core/')
    },
  )

  it.each(NAVIGATOR_THROUGH_THE_GLOBAL_OBJECT)(
    'rejects navigator reached through the global object in %s in %s',
    { timeout: LINT_TIMEOUT_MS },
    expectRejected,
  )

  it.each(rows([NAVIGATOR_STORAGE], PLAIN_SCRIPT_FILES))(
    'rejects %s in the plain script file %s',
    { timeout: LINT_TIMEOUT_MS },
    expectRejected,
  )

  it.each(rows([LOCAL_STORAGE], ['scripts/sample.ts', '.storybook/sample.ts']))(
    'accepts %s in %s',
    { timeout: LINT_TIMEOUT_MS },
    expectAccepted,
  )
})

describe('storage globals outside storage: which comments count as a disable', () => {
  it.each(COMMENTS_THAT_DISABLE_THE_RULES)('counts %s as a disable', (comment) => {
    expect(disablesStorageRule(comment)).toBe(true)
  })

  it.each(COMMENTS_THAT_DO_NOT)('does not count %s as a disable', (comment) => {
    expect(disablesStorageRule(comment)).toBe(false)
  })
})
