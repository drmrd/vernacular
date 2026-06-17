import { describe, expect, it, vi } from 'vitest'
import { join, resolve } from 'node:path'
import { createNodePackReader, readManifestFromDisk, runPackCli } from './vernacular-pack.mjs'

// Vitest runs with the project root as the working directory, matching the
// repository's other fixture-backed tests (for example derive-underlay-fixture).
const packsDir = resolve('tests/fixtures/packs')

function integrationDeps() {
  const reports = []
  return {
    reports,
    readManifest: readManifestFromDisk,
    createReader: createNodePackReader,
    // Capture the build report in memory so the smoke does not write into the repo.
    writeReport: (_dir, report) => {
      reports.push(report)
      return Promise.resolve()
    },
    log: vi.fn(),
    error: vi.fn(),
  }
}

describe('vernacular-pack against the fixture packs', () => {
  it('validates and builds the well-formed pack with real readers', async () => {
    const deps = integrationDeps()
    const packDir = join(packsDir, 'vernacular-starter-1.0.0')

    expect(await runPackCli(['validate', packDir], deps)).toBe(0)
    expect(await runPackCli(['build', packDir], deps)).toBe(0)
    expect(deps.error).not.toHaveBeenCalled()

    const report = deps.reports.at(-1)
    expect(report.status).toBe('PASS')
    expect(report.assets).toHaveLength(1)
    expect(report.licenses.distinct).toEqual(['CC0-1.0'])
  })

  it('reports every distinct problem in the broken pack', async () => {
    const deps = integrationDeps()
    const packDir = join(packsDir, 'broken-pack-wrong')

    expect(await runPackCli(['validate', packDir], deps)).toBe(1)

    const messages = deps.error.mock.calls.map((call) => call[0]).join('\n')
    expect(messages).toMatch(/forbids redistribution/)
    expect(messages).toMatch(/content hash does not match/)
    expect(messages).toMatch(/thumbnail missing/)
    expect(messages).toMatch(/orphan file not referenced/)
    expect(messages).toMatch(/NOTICE: required pack file missing/)
    expect(messages).toMatch(/broken-pack-1\.0\.0/)
  })
})
