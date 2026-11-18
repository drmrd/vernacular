import type { Linter } from 'eslint'

export interface RuleException {
  file: string
  rule: string
  issue: number
  max?: number
  allowImportOf?: undefined
}

export interface ImportException {
  file: string
  allowImportOf: string
  issue: number
  rule?: undefined
  max?: undefined
}

export type LintException = RuleException | ImportException

export interface ConfigModule {
  lintExceptions: LintException[]
  buildConfig: (exceptions?: LintException[]) => Linter.Config[]
}

// eslint.config.js is plain JavaScript with no declaration file, so load it by a
// path held in a variable. The module is typed here, at the one place it is read.
const CONFIG_PATH = '../../eslint.config.js'

export const lintConfig = (await import(/* @vite-ignore */ CONFIG_PATH)) as ConfigModule
