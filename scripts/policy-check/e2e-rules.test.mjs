import { describe, expect, it } from 'vitest'
import { e2eTimingFindings } from './e2e-rules.mjs'
import { added } from './fake-git-test-support.mjs'

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

  it('leaves a raised Playwright time limit alone', () => {
    const texts = ['  test.setTimeout(TEST_TIMEOUT_MS)', '  testInfo.setTimeout(60_000)']
    const lines = texts.map((text, index) => added('e2e/tests/walls.spec.ts', index + 1, text))
    expect(e2eTimingFindings(lines)).toEqual([])
  })

  it('warns about setTimeout called on window or globalThis', () => {
    const texts = ['  window.setTimeout(done, 5)', '  globalThis.setTimeout(done, 5)']
    const lines = texts.map((text, index) => added('e2e/tests/walls.spec.ts', index + 1, text))
    const findings = e2eTimingFindings(lines)
    expect(findings).toHaveLength(lines.length)
    findings.forEach((finding, index) => {
      expect(finding.rule).toBe('e2e-timing-or-focus')
      expect(finding.line).toBe(index + 1)
    })
  })

  it('warns about focus and skip on it and describe, nested or not', () => {
    const texts = [
      "it.only('draws a wall', () => {",
      "describe.only('walls', () => {",
      "describe.skip('walls', () => {",
      "test.describe.skip('x', () => {",
      '  it.skip()',
    ]
    const lines = texts.map((text, index) => added('e2e/tests/walls.spec.ts', index + 1, text))
    const findings = e2eTimingFindings(lines)
    expect(findings).toHaveLength(lines.length)
    findings.forEach((finding, index) => {
      expect(finding.rule).toBe('e2e-timing-or-focus')
      expect(finding.line).toBe(index + 1)
    })
  })

  it('checks tsx and mjs files under e2e', () => {
    const lines = [
      added('e2e/support/view.tsx', 7, '  await page.waitForTimeout(5)'),
      added('e2e/support/view.mjs', 9, '  await page.waitForTimeout(5)'),
    ]
    const findings = e2eTimingFindings(lines)
    expect(findings).toHaveLength(lines.length)
    findings.forEach((finding, index) => {
      expect(finding.rule).toBe('e2e-timing-or-focus')
      expect(finding.file).toBe(lines[index].file)
      expect(finding.line).toBe(lines[index].line)
    })
  })

  it('ignores non-code files under e2e and paths that only contain e2e later', () => {
    const lines = [
      added('e2e/README.md', 1, "test.only('x', () => {"),
      added('packages/e2e/a.ts', 2, "test.only('x', () => {"),
    ]
    expect(e2eTimingFindings(lines)).toEqual([])
  })

  it('gives one finding for each pattern that a single line matches', () => {
    const lines = [
      added(
        'e2e/tests/walls.spec.ts',
        8,
        "test.only('x', async () => { await page.waitForTimeout(5) })",
      ),
    ]
    const findings = e2eTimingFindings(lines)
    expect(findings).toHaveLength(2)
    findings.forEach((finding) => {
      expect(finding.rule).toBe('e2e-timing-or-focus')
      expect(finding.file).toBe('e2e/tests/walls.spec.ts')
      expect(finding.line).toBe(8)
    })
  })

  it('gives every finding a non-empty message', () => {
    const lines = [
      added('e2e/tests/walls.spec.ts', 1, '  await page.waitForTimeout(5)'),
      added('e2e/tests/walls.spec.ts', 2, "test.only('x', () => {"),
      added('e2e/tests/walls.spec.ts', 3, '  test.skip()'),
    ]
    const findings = e2eTimingFindings(lines)
    expect(findings).toHaveLength(lines.length)
    findings.forEach((finding) => {
      expect(typeof finding.message).toBe('string')
      expect(finding.message.length).toBeGreaterThan(0)
    })
  })
})
