import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Relative to the repository root, where Vitest runs, as the schema path of the sizes test is. */
const BASELINE_PATH = resolve('tests', 'performance', 'baseline.json')
const JSON_INDENT = 2

/** True when the run was asked to record new numbers in place of comparing them. */
export function isUpdatingBaseline(): boolean {
  return process.env['UPDATE_PERFORMANCE_BASELINE'] === '1'
}

/** The baseline file as it is on disk now, so a section written in this run reads back. */
export function readBaseline(): Record<string, unknown> {
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Record<string, unknown>
}

/** Rewrites one section of the baseline file and leaves every other section as it is. */
export function writeBaselineSection(section: string, value: unknown): void {
  const next = { ...readBaseline(), [section]: value }
  writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, JSON_INDENT)}\n`)
}
