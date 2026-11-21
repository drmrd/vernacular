import { describe, expect, it, vi } from 'vitest'
import { runRgbAudit } from './rgb-audit.mjs'
import { gitLog } from './cycle-audit-test-support.mjs'

function loneGreenLog() {
  return gitLog([{ sha: 'green1', subject: 'feat: add the widget', files: ['core/widget.ts'] }])
}

function greenTouchingTestLog() {
  return gitLog([
    { sha: 'green1', subject: 'feat: add the widget', files: ['core/widget.ts'] },
    { sha: 'green2', subject: 'feat: add the gadget', files: ['core/gadget.test.ts'] },
  ])
}

function loggedLines(log) {
  return log.mock.calls
    .map((call) => call[0])
    .join('\n')
    .split('\n')
}

describe('runRgbAudit severity', () => {
  it('exits 0 and marks the line as a warning when every violation is a warning', async () => {
    const log = vi.fn()

    const code = await runRgbAudit([], {
      runGit: () => loneGreenLog(),
      log,
      severityOf: () => 'warn',
    })

    expect(code).toBe(0)
    expect(loggedLines(log).some((line) => line.includes('[ordering] (warning)'))).toBe(true)
  })

  it('keeps failing on violations the table marks as failing', async () => {
    const log = vi.fn()

    const code = await runRgbAudit([], { runGit: () => loneGreenLog(), log })

    expect(code).toBe(1)
    expect(loggedLines(log)).toContainEqual(
      expect.stringMatching(/^ {2}\[ordering\] GREEN commit green1 /),
    )
    expect(loggedLines(log).join('\n')).not.toContain('(warning)')
  })

  it('exits 1 and marks only the warning lines when one rule warns and another fails', async () => {
    const log = vi.fn()
    const severityOf = (rule) => (rule === 'ordering' ? 'warn' : 'fail')

    const code = await runRgbAudit([], { runGit: () => greenTouchingTestLog(), log, severityOf })

    const lines = loggedLines(log)
    expect(code).toBe(1)
    expect(lines).toContain('rgb:audit: 3 violation(s) in main..HEAD')
    expect(lines.filter((line) => line.includes('(warning)'))).toHaveLength(2)
    expect(lines.filter((line) => line.includes('[independence]'))).toEqual([
      '  [independence] GREEN commit green2 modifies test file(s): core/gadget.test.ts',
    ])
  })
})
