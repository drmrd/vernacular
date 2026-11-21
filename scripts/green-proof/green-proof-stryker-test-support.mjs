/** Fake Stryker answers for the cycle tests. */

/** The base `stryker.conf.json` a scenario writes unless it passes its own `strykerBase`. */
export const STRYKER_BASE = {
  testRunner: 'vitest',
  thresholds: { high: 80, low: 60, break: 50 },
}
const EMPTY_STRYKER_REPORT = '{"files":{}}'

/**
 * The answer to one fake `stryker run <config>` call. It moves the fake clock by `strykerMs`,
 * then throws `planned[group].throws` when that is set, else writes the report the config names.
 * `planned[group]` is `{ status, stdout, stderr, report, throws }`: `report` is the text written to
 * the config's `jsonReporter.fileName` (`null` writes none, the default is `{"files":{}}`).
 * @param {string} configPath the config argument of the call, relative to `root`
 * @param {Record<string, { report?: string | null, throws?: string, status?: number, stdout?: string, stderr?: string }>} planned
 * @param {{ root: string, advance(ms: number): void, strykerMs: number, files: { readFile(path: string): string, writeFile(path: string, text: string): void } }} run
 */
export function strykerAnswer(configPath, planned, run) {
  run.advance(run.strykerMs)
  const group = /stryker-(\w+)\.json$/.exec(configPath)?.[1]
  const { report = EMPTY_STRYKER_REPORT, throws, ...result } = planned[group] ?? {}
  if (throws !== undefined) throw new Error(throws)
  if (report !== null) {
    const { fileName } = JSON.parse(run.files.readFile(`${run.root}/${configPath}`)).jsonReporter
    run.files.writeFile(`${run.root}/${fileName}`, report)
  }
  return result
}
