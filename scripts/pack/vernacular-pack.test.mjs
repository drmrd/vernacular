import { describe, expect, it, vi } from 'vitest'
import { runPackCli } from './vernacular-pack.mjs'

function validManifest() {
  return {
    packId: 'vernacular-starter',
    version: '1.0.0',
    license: 'CC0-1.0',
    attribution: 'Vernacular project',
    eras: ['mid-century'],
    categories: ['seating'],
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

describe('runPackCli failures', () => {
  it('returns exit code 1 and reports each error for an invalid manifest', async () => {
    const cliDeps = deps({ assets: [] })

    const code = await runPackCli(['build', 'packs/broken'], cliDeps)

    expect(code).toBe(1)
    expect(cliDeps.error).toHaveBeenCalledWith(expect.stringContaining('Invalid pack manifest'))
  })

  it('returns exit code 1 when the manifest cannot be read', async () => {
    const cliDeps = {
      readManifest: vi.fn(() => Promise.reject(new Error('ENOENT'))),
      log: vi.fn(),
      error: vi.fn(),
    }

    const code = await runPackCli(['validate', 'packs/missing'], cliDeps)

    expect(code).toBe(1)
    expect(cliDeps.error).toHaveBeenCalledWith(expect.stringContaining('Could not read manifest'))
  })

  it('prints usage and returns exit code 2 for an unknown command', async () => {
    const cliDeps = deps(validManifest())

    expect(await runPackCli(['publish', 'packs/example'], cliDeps)).toBe(2)
    expect(cliDeps.error).toHaveBeenCalledWith(expect.stringContaining('Usage'))
  })

  it('prints usage and returns exit code 2 when the pack directory is missing', async () => {
    const cliDeps = deps(validManifest())

    expect(await runPackCli(['validate'], cliDeps)).toBe(2)
    expect(cliDeps.error).toHaveBeenCalledWith(expect.stringContaining('Usage'))
  })
})
