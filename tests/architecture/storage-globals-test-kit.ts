import { fileURLToPath } from 'node:url'
import { ESLint, type Linter } from 'eslint'
import { expect } from 'vitest'

// One shared instance per test file: building the flat config is the expensive part. Linting is
// CPU-bound, so the rows that use it allow extra time over Vitest's 5s per-test default.
const eslint = new ESLint()
export const LINT_TIMEOUT_MS = 30_000

export const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))

export const GLOBAL_RULE = 'no-restricted-globals'
export const STORAGE_RULES = [GLOBAL_RULE, 'no-restricted-properties', 'no-restricted-syntax']
export const STORAGE_API_NAMES = [
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'caches',
  'showDirectoryPicker',
  'showOpenFilePicker',
  'showSaveFilePicker',
]

const STORAGE_MESSAGE_TEXT = 'storage/'

/** A sample text and the file name that it is linted under. */
export type Row = [source: string, filePath: string]

export function rows(sources: readonly string[], filePaths: readonly string[]): Row[] {
  return filePaths.flatMap((filePath) => sources.map((source): Row => [source, filePath]))
}

export async function lintMessages(
  source: string,
  filePath: string,
): Promise<Linter.LintMessage[]> {
  const [result] = await eslint.lintText(`${source}\n`, { filePath })
  const messages = result?.messages ?? []
  const parseFailure = messages.find((message) => message.fatal === true)
  if (parseFailure !== undefined) {
    throw new Error(`${filePath} did not parse: ${parseFailure.message}`)
  }
  return messages
}

/** The messages of the three storage rules that point at storage/. */
export async function storageRuleMessages(source: string, filePath: string): Promise<string[]> {
  const messages = await lintMessages(source, filePath)
  return messages
    .filter((message) => message.ruleId !== null && STORAGE_RULES.includes(message.ruleId))
    .map((message) => message.message)
    .filter((text) => text.includes(STORAGE_MESSAGE_TEXT))
}

/** The messages of any rule that point at storage/. */
export async function storageTextMessages(source: string, filePath: string): Promise<string[]> {
  const messages = await lintMessages(source, filePath)
  return messages
    .map((message) => message.message)
    .filter((text) => text.includes(STORAGE_MESSAGE_TEXT))
}

export async function globalRuleMessages(source: string, filePath: string): Promise<string[]> {
  const messages = await lintMessages(source, filePath)
  return messages
    .filter((message) => message.ruleId === GLOBAL_RULE)
    .map((message) => message.message)
}

export async function expectRejected(source: string, filePath: string): Promise<void> {
  expect(await storageRuleMessages(source, filePath)).not.toEqual([])
}

export async function expectAccepted(source: string, filePath: string): Promise<void> {
  expect(await storageTextMessages(source, filePath)).toEqual([])
}

const DISABLE_DIRECTIVE = /eslint-disable(?:-next-line|-line)?([^\n]*)/g
const CONFIG_COMMENT = /\/\*\s*eslint\s([\s\S]*?)\*\//g

function namesStorageRule(commentText: string): boolean {
  const beforeReason = commentText.split('--')[0] ?? ''
  return STORAGE_RULES.some((rule) => beforeReason.includes(rule))
}

function hasDisableDirective(text: string): boolean {
  return [...text.matchAll(DISABLE_DIRECTIVE)].some(([, rest]) => {
    const named = (rest ?? '').split('--')[0] ?? ''
    const bare = named.replace('*/', '').trim() === ''
    return bare || namesStorageRule(named)
  })
}

function hasConfigComment(text: string): boolean {
  return [...text.matchAll(CONFIG_COMMENT)].some(([, body]) => namesStorageRule(body ?? ''))
}

/**
 * Whether a source text carries a comment that switches off one of the three storage rules: a
 * disable directive with no rule list or with one of the rules in its list, or a block comment that
 * configures one of the rules. A rule name in the reason after `--` does not count.
 */
export function disablesStorageRule(text: string): boolean {
  return hasDisableDirective(text) || hasConfigComment(text)
}
