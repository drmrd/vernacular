import { describe, expect, it } from 'vitest'
import { e2eTimingFindings } from './e2e-rules.mjs'

/** @param {string} file @param {number} line @param {string} text */
function added(file, line, text) {
  return { file, line, text }
}

describe('e2eTimingFindings', () => {
  it('warns about waitForTimeout, sleep, and setTimeout in an added e2e line', () => {
    const lines = [
      added('e2e/tests/walls.spec.ts', 12, '  await page.waitForTimeout(500)'),
      added('e2e/tests/walls.spec.ts', 20, '  await sleep(1000)'),
      added('e2e/support/wait.mjs', 4, '  setTimeout(resolve, 250)'),
    ]
    const findings = e2eTimingFindings(lines)
    expect(findings).toHaveLength(lines.length)
    findings.forEach((finding, index) => {
      expect(finding.rule).toBe('e2e-timing-or-focus')
      expect(finding.file).toBe(lines[index].file)
      expect(finding.line).toBe(lines[index].line)
    })
  })

  it('warns about a focused test and a skip with a title or with no arguments', () => {
    const texts = [
      "test.only('draws a wall', async ({ page }) => {",
      "test.describe.only('walls', () => {",
      "test.skip('draws a wall', async ({ page }) => {",
      '  test.skip()',
    ]
    const lines = texts.map((text, index) => added('e2e/tests/walls.spec.ts', index + 1, text))
    const findings = e2eTimingFindings(lines)
    expect(findings).toHaveLength(lines.length)
    findings.forEach((finding, index) => {
      expect(finding.rule).toBe('e2e-timing-or-focus')
      expect(finding.file).toBe('e2e/tests/walls.spec.ts')
      expect(finding.line).toBe(index + 1)
    })
  })

  it('leaves a conditional self-skip alone', () => {
    const texts = ["  test.skip(!hasWebGpu, 'needs WebGPU')", '  test.skip(']
    const lines = texts.map((text, index) => added('e2e/tests/render.spec.ts', index + 1, text))
    expect(e2eTimingFindings(lines)).toEqual([])
  })

  it('ignores comments and files outside e2e', () => {
    const lines = [
      added('e2e/tests/walls.spec.ts', 3, '  // waitForTimeout(5) is banned here'),
      added('e2e/tests/walls.spec.ts', 4, '   * never call sleep(10) in a test'),
      added('core/a.test.ts', 5, "test.only('focused', () => {"),
    ]
    expect(e2eTimingFindings(lines)).toEqual([])
  })
})
