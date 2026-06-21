import { describe, expect, it, vi } from 'vitest'
import { runDecide } from './decide.mjs'

function deps({ event = 'pull_request', changed = [], labels = [], draft = false } = {}) {
  const outputs = {}
  return {
    runGit: vi.fn(() => changed.join('\n')),
    readLabels: () => labels,
    readDraft: () => draft,
    event,
    setOutput: (name, value) => {
      outputs[name] = value
    },
    log: vi.fn(),
    outputs,
  }
}

describe('runDecide', () => {
  it('runs everything in the merge queue', async () => {
    const d = deps({ event: 'merge_group' })
    await runDecide([], d)
    expect(d.outputs).toMatchObject({ e2e: 'true', visual: 'true', lighthouse: 'true' })
  })

  it('runs everything on push to main', async () => {
    const d = deps({ event: 'push' })
    await runDecide([], d)
    expect(d.outputs).toMatchObject({ e2e: 'true', visual: 'true', lighthouse: 'true' })
  })

  it('on a PR, runs e2e for runtime-layer changes but not lighthouse', async () => {
    const d = deps({ changed: ['engine/renderer/create-renderer.ts'] })
    await runDecide(['--base', 'origin/main'], d)
    expect(d.outputs).toMatchObject({ e2e: 'true', lighthouse: 'false' })
  })

  it('on a PR, runs the visual suite for story and editor changes', async () => {
    const d = deps({ changed: ['editor/shell/toolbar.stories.tsx'] })
    await runDecide(['--base', 'origin/main'], d)
    expect(d.outputs.visual).toBe('true')
  })

  it('skips heavy suites for a docs-only PR', async () => {
    const d = deps({ changed: ['docs/plans/x.md'] })
    await runDecide(['--base', 'origin/main'], d)
    expect(d.outputs).toMatchObject({ e2e: 'false', visual: 'false', lighthouse: 'false' })
  })

  it('skips heavy suites on a draft even when paths match', async () => {
    const d = deps({ changed: ['editor/plan/plan-view.tsx'], draft: true })
    await runDecide(['--base', 'origin/main'], d)
    expect(d.outputs).toMatchObject({ e2e: 'false', visual: 'false', lighthouse: 'false' })
  })

  it('run:e2e overrides a draft', async () => {
    const d = deps({ changed: ['core/index.ts'], draft: true, labels: ['run:e2e'] })
    await runDecide(['--base', 'origin/main'], d)
    expect(d.outputs.e2e).toBe('true')
  })

  it('run:visual overrides a draft', async () => {
    const d = deps({ changed: ['core/index.ts'], draft: true, labels: ['run:visual'] })
    await runDecide(['--base', 'origin/main'], d)
    expect(d.outputs.visual).toBe('true')
    expect(d.outputs.e2e).toBe('false')
  })

  it('ci:full forces all suites', async () => {
    const d = deps({ changed: ['README.md'], labels: ['ci:full'] })
    await runDecide(['--base', 'origin/main'], d)
    expect(d.outputs).toMatchObject({ e2e: 'true', visual: 'true', lighthouse: 'true' })
  })

  it('ci:skip-heavy forces all heavy suites off', async () => {
    const d = deps({ changed: ['editor/plan/plan-view.tsx'], labels: ['ci:skip-heavy'] })
    await runDecide(['--base', 'origin/main'], d)
    expect(d.outputs).toMatchObject({ e2e: 'false', visual: 'false', lighthouse: 'false' })
  })
})
