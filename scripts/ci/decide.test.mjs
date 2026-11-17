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

describe('the paths that shape a heavy run', () => {
  async function decideFor(options) {
    const d = deps(options)
    await runDecide(['--base', 'origin/main'], d)
    return d.outputs
  }

  it('runs the end-to-end suite for a change to the end-to-end Playwright config', async () => {
    const outputs = await decideFor({ changed: ['playwright.config.ts'] })
    expect(outputs).toEqual({ e2e: 'true', visual: 'false', lighthouse: 'false' })
  })

  it('runs the visual suite for a change to the stories Playwright config', async () => {
    const outputs = await decideFor({ changed: ['playwright.stories.config.ts'] })
    expect(outputs).toEqual({ e2e: 'false', visual: 'true', lighthouse: 'false' })
  })

  it.each(['README.md', 'docs/specs/x.md', 'scripts/ci/decide.mjs', 'tsconfig.json'])(
    'turns no heavy suite on for a change to only %s',
    async (path) => {
      const outputs = await decideFor({ changed: [path] })
      expect(outputs).toEqual({ e2e: 'false', visual: 'false', lighthouse: 'false' })
    },
  )

  const NOT_ASSERTED = expect.any(String)

  it.each([
    { path: 'vite.config.ts', e2e: 'true', visual: 'true' },
    { path: 'vitest.config.ts', e2e: 'false', visual: 'true' },
    { path: 'index.html', e2e: 'true', visual: 'false' },
    { path: 'src/main.tsx', e2e: 'true', visual: 'false' },
    { path: 'src/service-worker.ts', e2e: 'true', visual: 'false' },
    { path: 'public/manifest.webmanifest', e2e: 'true', visual: 'true' },
    { path: 'e2e/stories/story-visual.spec.ts', e2e: NOT_ASSERTED, visual: 'true' },
  ])('turns the suites on for a change to only $path', async ({ path, e2e, visual }) => {
    const outputs = await decideFor({ changed: [path] })
    expect(outputs).toEqual({ e2e, visual, lighthouse: 'false' })
  })

  it.each([
    { path: 'public/mockServiceWorker.js', e2e: 'true', visual: 'true' },
    { path: 'src/setupTests.ts', e2e: 'true', visual: 'true' },
    { path: 'scripts/serve-static.mjs', e2e: 'false', visual: 'true' },
    { path: 'scripts/story-index.mjs', e2e: 'false', visual: 'true' },
    { path: 'pnpm-lock.yaml', e2e: 'true', visual: 'true' },
  ])(
    'turns the suites on for the lockfile and the files that the story job loads: $path',
    async ({ path, e2e, visual }) => {
      const outputs = await decideFor({ changed: [path] })
      expect(outputs).toEqual({ e2e, visual, lighthouse: 'false' })
    },
  )

  it.each(['package.json', 'scripts/knowledge-index.mjs'])(
    'turns no heavy suite on for a change to only %s',
    async (path) => {
      const outputs = await decideFor({ changed: [path] })
      expect(outputs).toEqual({ e2e: 'false', visual: 'false', lighthouse: 'false' })
    },
  )

  it('keeps the story visuals off for an end-to-end test outside the stories folder', async () => {
    const outputs = await decideFor({ changed: ['e2e/tests/x.spec.ts'] })
    expect(outputs).toEqual({ e2e: 'true', visual: 'false', lighthouse: 'false' })
  })

  it('skips the end-to-end suite on a draft even for a change to the Playwright config', async () => {
    const outputs = await decideFor({ changed: ['playwright.config.ts'], draft: true })
    expect(outputs.e2e).toBe('false')
  })
})
