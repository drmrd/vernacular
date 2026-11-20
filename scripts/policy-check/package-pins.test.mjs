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
    expect(findings[0].line).toBeUndefined()
    expect(findings[0].message).toContain('JSON')
  })

  it('accepts an exact scoped npm alias', () => {
    const manifest = JSON.stringify({ dependencies: { a: 'npm:@scope/pkg@1.0.0' } }, null, 2)
    const readFile = readerFor({ 'package.json': manifest })
    expect(exactPinFindings([changed('package.json')], readFile)).toEqual([])
  })

  it.each(['npm:@scope/pkg@^1.0.0', 'npm:foo bar@1.0.0'])('refuses the npm alias %s', (alias) => {
    const manifest = JSON.stringify({ dependencies: { a: alias } }, null, 2)
    const readFile = readerFor({ 'package.json': manifest })
    expect(exactPinFindings([changed('package.json')], readFile)).toHaveLength(1)
  })

  it('names the section, the package, and the value in each message', () => {
    const manifest = JSON.stringify(
      { devDependencies: { beta: '~4.0.0' }, pnpm: { overrides: { x: '*' } } },
      null,
      2,
    )
    const readFile = readerFor({ 'package.json': manifest })
    const [dev, override] = exactPinFindings([changed('package.json')], readFile)
    expect(dev.message).toContain('devDependencies')
    expect(dev.message).toContain('beta')
    expect(dev.message).toContain('~4.0.0')
    expect(override.message).toContain('pnpm.overrides')
    expect(override.message).toContain('x')
    expect(override.message).toContain('*')
  })

  it('carries no commit sha and keeps the file path out of the message', () => {
    const manifest = JSON.stringify({ dependencies: { alpha: '^1.2.3' } }, null, 2)
    const readFile = readerFor({ 'packages/ui/package.json': manifest })
    const findings = exactPinFindings([changed('packages/ui/package.json')], readFile)
    expect(findings).toHaveLength(1)
    expect(findings[0]).not.toHaveProperty('sha')
    expect(findings[0].message).not.toContain('packages/ui/package.json')
  })

  it('shows an object value as JSON and refuses a null value', () => {
    const objectManifest = JSON.stringify({ pnpm: { overrides: { foo: { bar: '1.0.0' } } } })
    const nullManifest = JSON.stringify({ pnpm: { overrides: { foo: null } } })
    const objectFindings = exactPinFindings(
      [changed('package.json')],
      readerFor({ 'package.json': objectManifest }),
    )
    const nullFindings = exactPinFindings(
      [changed('package.json')],
      readerFor({ 'package.json': nullManifest }),
    )
    expect(objectFindings).toHaveLength(1)
    expect(objectFindings[0].message).toContain('{"bar":"1.0.0"}')
    expect(objectFindings[0].message).not.toContain('[object Object]')
    expect(nullFindings).toHaveLength(1)
  })

  it('points at the line inside the section that holds the ranged entry', () => {
    const lines = [
      '{',
      '  "devDependencies": {',
      '    "foo": "1.0.0"',
      '  },',
      '  "pnpm": {',
      '    "overrides": {',
      '      "foo": "^1.0.0"',
      '    }',
      '  }',
      '}',
      '',
    ]
    const readFile = readerFor({ 'package.json': lines.join('\n') })
    const findings = exactPinFindings([changed('package.json')], readFile)
    expect(findings.map((finding) => finding.line)).toEqual([7])
  })

  it('ignores a scripts key with the same name as a ranged dependency', () => {
    const lines = [
      '{',
      '  "scripts": {',
      '    "vite": "vite build"',
      '  },',
      '  "devDependencies": {',
      '    "vite": "^5.0.0"',
      '  }',
      '}',
      '',
    ]
    const readFile = readerFor({ 'package.json': lines.join('\n') })
    const findings = exactPinFindings([changed('package.json')], readFile)
    expect(findings.map((finding) => finding.line)).toEqual([6])
  })
})
