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

function validManifestWithAsset() {
  return {
    ...validManifest(),
    assets: [
      {
        contentHash: 'a'.repeat(64),
        name: 'Chair',
        kind: 'furniture',
        license: 'CC0-1.0',
        attribution: 'Vernacular project',
        eras: ['mid-century'],
        categories: ['seating'],
        dimensions: { width: 500, depth: 520, height: 800 },
      },
    ],
  }
}

const WEBP_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])

/**
 * A well-formed fake {@link PackReader} for the CLI tests. By default every
 * directory listing is empty, every file exists, every digest is empty, and
 * the directory basename matches `vernacular-starter-1.0.0`, so a manifest with
 * no assets yields no integrity errors. Per-category overrides flip one fact:
 *
 * - `dirName`  replaces the pack directory basename.
 * - `dirs`     supplies filenames per directory (orphans / referenced files).
 * - `exists`   replaces the existence predicate.
 * - `hashes`   supplies digests per relative path (content-hash mismatch).
 * - `reader`   overrides whole reader methods.
 */
function packReader(overrides = {}) {
  return {
    dirName: overrides.dirName ?? 'vernacular-starter-1.0.0',
    listDir: async (rel) => overrides.dirs?.[rel] ?? [],
    exists: overrides.exists ?? (async () => true),
    sha256: async (rel) => overrides.hashes?.[rel] ?? '',
    readBytes: async () => WEBP_BYTES,
    ...overrides.reader,
  }
}

function deps(manifest) {
  return {
    readManifest: vi.fn(() => Promise.resolve(manifest)),
    createReader: vi.fn(() => packReader()),
    writeReport: vi.fn(() => Promise.resolve()),
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
    expect(cliDeps.error).toHaveBeenCalledWith(expect.stringContaining('Invalid pack'))
  })

  it('returns exit code 1 and surfaces on-disk integrity errors', async () => {
    const cliDeps = deps(validManifestWithAsset())
    cliDeps.createReader = vi.fn(() =>
      packReader({
        dirs: {
          assets: ['a'.repeat(64) + '.glb'],
          thumbnails: ['a'.repeat(64) + '.webp'],
        },
        hashes: { ['assets/' + 'a'.repeat(64) + '.glb']: 'b'.repeat(64) },
      }),
    )

    const code = await runPackCli(['validate', 'packs/x'], cliDeps)

    expect(code).toBe(1)
    expect(cliDeps.error).toHaveBeenCalledWith(expect.stringContaining('content hash'))
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

  it('warns about a share-alike license mix without failing', async () => {
    const manifest = validManifestWithAsset()
    manifest.assets[0].license = 'CC-BY-SA-4.0' // pack license stays CC0-1.0
    const cliDeps = deps(manifest)
    const hash = 'a'.repeat(64)
    // Clean reader so the only finding is the (non-blocking) share-alike warning.
    cliDeps.createReader = vi.fn(() => packReader({ hashes: { [`assets/${hash}.glb`]: hash } }))

    const code = await runPackCli(['validate', 'packs/x'], cliDeps)

    expect(code).toBe(0)
    expect(cliDeps.log).toHaveBeenCalledWith(expect.stringContaining('share-alike'))
    expect(cliDeps.error).not.toHaveBeenCalled()
  })
})

describe('runPackCli build', () => {
  it('build writes a PASS report for a valid pack', async () => {
    const cliDeps = deps(validManifestWithAsset())
    const hash = 'a'.repeat(64)
    cliDeps.createReader = vi.fn(() => packReader({ hashes: { [`assets/${hash}.glb`]: hash } }))

    const code = await runPackCli(['build', 'packs/x'], cliDeps)

    expect(code).toBe(0)
    expect(cliDeps.writeReport).toHaveBeenCalledTimes(1)
    const [reportDir, report] = cliDeps.writeReport.mock.calls[0]
    expect(reportDir).toBe('packs/x')
    expect(report.status).toBe('PASS')
    expect(report.assets).toEqual([{ name: 'Chair', contentHash: hash }])
    expect(report.licenses.distinct).toContain('CC0-1.0')
  })

  it('build writes a FAIL report and exits 1 for an invalid pack', async () => {
    const cliDeps = deps(validManifestWithAsset())
    const hash = 'a'.repeat(64)
    cliDeps.createReader = vi.fn(() =>
      packReader({ hashes: { [`assets/${hash}.glb`]: 'b'.repeat(64) } }),
    )

    const code = await runPackCli(['build', 'packs/x'], cliDeps)

    expect(code).toBe(1)
    expect(cliDeps.writeReport).toHaveBeenCalledTimes(1)
    const [, report] = cliDeps.writeReport.mock.calls[0]
    expect(report.status).toBe('FAIL')
    expect(report.errors.length).toBeGreaterThan(0)
    expect(cliDeps.error).toHaveBeenCalled()
  })
})
