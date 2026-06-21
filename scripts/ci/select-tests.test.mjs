import { describe, expect, it, vi } from 'vitest'
import { runSelectTests } from './select-tests.mjs'

const COUPLING = {
  runAll: ['vite.config.ts', 'package.json'],
  runAllPrefixes: ['src/'],
  edges: { 'schema/': ['core'], 'resources/': ['engine'] },
}

function deps(changedFiles) {
  const outputs = {}
  return {
    runGit: vi.fn(() => changedFiles.join('\n')),
    readCoupling: () => COUPLING,
    setOutput: (name, value) => {
      outputs[name] = value
    },
    log: vi.fn(),
    outputs,
  }
}

describe('runSelectTests', () => {
  it('selects the changed layer and everything above it', async () => {
    const d = deps(['editor/plan/plan-view.tsx'])
    await runSelectTests(['--base', 'origin/main'], d)
    expect(d.outputs.mode).toBe('some')
    expect(d.outputs.paths).toBe('app/ editor/')
  })

  it('treats a runAll input as a full run', async () => {
    const d = deps(['package.json'])
    await runSelectTests(['--base', 'origin/main'], d)
    expect(d.outputs.mode).toBe('all')
  })

  it('treats a runAllPrefixes match as a full run', async () => {
    const d = deps(['src/setupTests.ts'])
    await runSelectTests(['--base', 'origin/main'], d)
    expect(d.outputs.mode).toBe('all')
  })

  it('expands edge prefixes before the closure (schema reaches core -> all)', async () => {
    const d = deps(['schema/project.schema.json'])
    await runSelectTests(['--base', 'origin/main'], d)
    expect(d.outputs.paths).toBe('app/ bridge/ core/ editor/ engine/ storage/')
  })

  it('includes changed non-layer test dirs (scripts, tests)', async () => {
    const d = deps(['scripts/pack/vernacular-pack.mjs'])
    await runSelectTests(['--base', 'origin/main'], d)
    expect(d.outputs.mode).toBe('some')
    expect(d.outputs.paths).toBe('scripts/')
  })

  it('reports none when nothing test-bearing changed', async () => {
    const d = deps(['docs/plans/whatever.md'])
    await runSelectTests(['--base', 'origin/main'], d)
    expect(d.outputs.mode).toBe('none')
    expect(d.outputs.paths).toBe('')
  })

  it('reports none for an empty diff', async () => {
    const d = deps([])
    await runSelectTests(['--base', 'origin/main'], d)
    expect(d.outputs.mode).toBe('none')
  })

  it('passes the base ref through to git', async () => {
    const d = deps(['core/index.ts'])
    await runSelectTests(['--base', 'origin/release'], d)
    expect(d.runGit.mock.calls[0][0].join(' ')).toContain('origin/release...HEAD')
  })
})
