import { describe, expect, it, vi } from 'vitest'
import { runPackCli } from './vernacular-pack.mjs'

function validManifest() {
  return {
    packId: 'vernacular-starter',
    version: '1.0.0',
    license: 'CC0-1.0',
    attribution: 'Vernacular project',
    assets: [],
  }
}

function deps(manifest) {
  return {
    readManifest: vi.fn(() => Promise.resolve(manifest)),
    log: vi.fn(),
    error: vi.fn(),
  }
}

describe('runPackCli success', () => {
  it('validates a pack directory and returns exit code 0', async () => {
    const cliDeps = deps(validManifest())

    const code = await runPackCli(['validate', 'packs/example'], cliDeps)

    expect(code).toBe(0)
    expect(cliDeps.readManifest).toHaveBeenCalledWith('packs/example')
    expect(cliDeps.log).toHaveBeenCalledWith(expect.stringContaining('valid'))
    expect(cliDeps.error).not.toHaveBeenCalled()
  })
})
