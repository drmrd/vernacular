import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Each recorded section has its own file, and one test file writes it. Vitest runs the test
 * files in parallel workers, so two sections in one shared file could each read the file
 * before the other wrote it, and the later write would drop the earlier one.
 */
export type BaselineFile =
  | 'baseline-sizes.json'
  | 'baseline-plan-draw.json'
  | 'baseline-scene-rebuild.json'

const JSON_INDENT = 2

/** Relative to the repository root, where Vitest runs, as the schema path of the sizes test is. */
function baselinePath(file: BaselineFile): string {
  return resolve('tests', 'performance', file)
}

/** True when the run was asked to record new numbers in place of comparing them. */
export function isUpdatingBaseline(): boolean {
  return process.env['UPDATE_PERFORMANCE_BASELINE'] === '1'
}

/** The baseline file as it is on disk now, so a baseline written in this run reads back. */
export function readBaseline(file: BaselineFile): unknown {
  return JSON.parse(readFileSync(baselinePath(file), 'utf8'))
}

/** Replaces the whole baseline file with the numbers measured in this run. */
export function writeBaseline(file: BaselineFile, value: unknown): void {
  writeFileSync(baselinePath(file), `${JSON.stringify(value, null, JSON_INDENT)}\n`)
}

/** The message of a failed count gate: what changed, and what to do if the change is intended. */
export function countChangedMessage(what: string): string {
  return [
    `The ${what} changed.`,
    'This is a gate.',
    'If the change is intended, run the same command with UPDATE_PERFORMANCE_BASELINE=1,',
    'commit the new baseline in the same pull request, and say why in its description.',
    'See tests/performance/README.md.',
  ].join(' ')
}
