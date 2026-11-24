import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const scriptPath = join(import.meta.dirname, 'retry-warning.mjs')
const retriedReport = join(import.meta.dirname, 'fixtures', 'playwright-report-retried.json')
const warningHeading = '### Warning: tests passed only on a retry'

describe('running the script file directly on a report with a test that passed only on a retry', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'retry-warning-direct-'))
  afterAll(() => rmSync(scratch, { recursive: true, force: true }))

  function run(summaryPath) {
    const env = { ...process.env }
    delete env.GITHUB_STEP_SUMMARY
    if (summaryPath) env.GITHUB_STEP_SUMMARY = summaryPath
    return spawnSync(process.execPath, [scriptPath, retriedReport], { env, encoding: 'utf8' })
  }

  it('writes the warning to the job summary file and the annotation to stdout, and exits 0', () => {
    const summaryPath = join(scratch, 'summary.md')
    const result = run(summaryPath)
    expect(result.status).toBe(0)
    expect(readFileSync(summaryPath, 'utf8')).toContain(warningHeading)
    expect(result.stdout).toMatch(/^::warning file=/m)
    expect(result.stdout).not.toContain(warningHeading)
  })

  it('writes the warning to stdout when there is no job summary file', () => {
    const result = run(undefined)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain(warningHeading)
    expect(result.stdout).toMatch(/^::warning file=/m)
  })
})
