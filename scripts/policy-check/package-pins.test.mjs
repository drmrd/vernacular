import { describe, expect, it, vi } from 'vitest'
import { exactPinFindings } from './package-pins.mjs'

/** @param {string} path @param {string} [status] */
function changed(path, status = 'M') {
  return { status, path }
}

/** @param {Record<string, string>} contents */
function readerFor(contents) {
  return vi.fn((path) => contents[path] ?? '')
}

describe('exactPinFindings', () => {
  it('accepts exact versions, prereleases, and exact npm aliases', () => {
    const manifest = JSON.stringify(
      {
        dependencies: { react: '19.2.6', rc: '1.0.0-rc.1', aliased: 'npm:foo@2.0.0' },
        devDependencies: { build: '1.2.3+build.5' },
      },
      null,
      2,
    )
    const readFile = readerFor({ 'package.json': manifest })
    expect(exactPinFindings([changed('package.json')], readFile)).toEqual([])
  })

  it('refuses caret, tilde, and other ranges in every dependency section', () => {
    const lines = [
      '{',
      '  "dependencies": {',
      '    "alpha": "^1.2.3"',
      '  },',
      '  "devDependencies": {',
      '    "beta": "~4.0.0"',
      '  },',
      '  "peerDependencies": {',
      '    "gamma": ">=1"',
      '  },',
      '  "pnpm": {',
      '    "overrides": {',
      '      "x": "*"',
      '    }',
      '  }',
      '}',
      '',
    ]
    const readFile = readerFor({ 'package.json': lines.join('\n') })
    const findings = exactPinFindings([changed('package.json')], readFile)
    expect(findings).toHaveLength(4)
    expect(findings.every((finding) => finding.rule === 'exact-pin')).toBe(true)
    expect(findings.every((finding) => finding.file === 'package.json')).toBe(true)
    expect(findings.map((finding) => finding.line)).toEqual([3, 6, 9, 13])
  })

  it('refuses an inexact version in optionalDependencies and a ranged npm alias', () => {
    const lines = [
      '{',
      '  "optionalDependencies": {',
      '    "fsevents": "^2.3.3",',
      '    "aliased": "npm:foo@^2.0.0"',
      '  }',
      '}',
      '',
    ]
    const readFile = readerFor({ 'packages/ui/package.json': lines.join('\n') })
    const findings = exactPinFindings([changed('packages/ui/package.json')], readFile)
    expect(findings.map((finding) => finding.line)).toEqual([3, 4])
    expect(findings.every((finding) => finding.file === 'packages/ui/package.json')).toBe(true)
  })

  it('leaves engines and scripts alone', () => {
    const manifest = JSON.stringify(
      {
        engines: { node: '>=22.18.0' },
        scripts: { build: 'vite build' },
        dependencies: { react: '19.2.6' },
      },
      null,
      2,
    )
    const readFile = readerFor({ 'package.json': manifest })
    expect(exactPinFindings([changed('package.json')], readFile)).toEqual([])
  })

  it('skips a deleted package.json and files that are not package.json', () => {
    const readFile = readerFor({})
    const files = [
      changed('package.json', 'D'),
      changed('docs/package.json.md'),
      changed('src/my-package.json'),
      changed('tsconfig.json'),
    ]
    expect(exactPinFindings(files, readFile)).toEqual([])
    expect(readFile).not.toHaveBeenCalled()
  })

  it('reports a package.json that does not parse', () => {
    const readFile = readerFor({ 'package.json': '{ "dependencies": ' })
    const findings = exactPinFindings([changed('package.json')], readFile)
    expect(findings).toHaveLength(1)
    expect(findings[0].rule).toBe('exact-pin')
    expect(findings[0].file).toBe('package.json')
  })
})
