import { describe, expect, it, vi } from 'vitest'
import { runRgbAudit } from './rgb-audit.mjs'
import { gitLog } from './cycle-audit-test-support.mjs'

function compliantLog() {
  return gitLog([
    { sha: 'red1', subject: 'test: pin the widget', files: ['core/widget.test.ts'] },
    { sha: 'green1', subject: 'feat: add the widget', files: ['core/widget.ts'] },
    { sha: 'blue1', subject: 'refactor: tidy the widget', files: ['core/widget.ts'] },
  ])
}

function loneFeatLog() {
  return gitLog([{ sha: 'green1', subject: 'feat: add the widget', files: ['core/widget.ts'] }])
}

function joinedLog(log) {
  return log.mock.calls.map((call) => call[0]).join('\n')
}

describe('runRgbAudit', () => {
  it('reports a clean range and resolves exit code 0 for a compliant cycle', async () => {
    const runGit = vi.fn(() => compliantLog())
    const log = vi.fn()

    const code = await runRgbAudit([], { runGit, log })

    expect(code).toBe(0)
    expect(runGit).toHaveBeenCalledTimes(1)
    expect(joinedLog(log)).toMatch(/clean \(main\.\.HEAD\)/)
  })

  it('reports the ordering rule and resolves exit code 1 for a lone green commit', async () => {
    const runGit = vi.fn(() => loneFeatLog())
    const log = vi.fn()

    const code = await runRgbAudit([], { runGit, log })

    expect(code).toBe(1)
    expect(joinedLog(log)).toContain('ordering')
  })

  it('passes an explicit --range value through to the git invocation', async () => {
    const runGit = vi.fn(() => compliantLog())
    const log = vi.fn()

    await runRgbAudit(['--range', 'origin/main..feature'], { runGit, log })

    expect(runGit.mock.calls[0][0]).toContain('origin/main..feature')
  })
})
