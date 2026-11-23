// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { TEXTURE_LIMITS } from '../../core/assets/texture-asset-rules.ts'
import { CHANGELOG, textureEntry } from './generate-fixtures.mjs'
import { encodePng } from './png-encoder.mjs'
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

const EXPECTED_BROKEN_PACK_PROBLEMS = 6
const OVERSIZE_SIDE = 2048
const RGB_CHANNELS = 3
const GREY = 0x80
const OVERSIZE_TEST_TIMEOUT_MS = 15_000

/** A format 2 pack in a temporary directory holding one texture above the file size limit. */
async function writeOversizeTexturePack(parent) {
  const pixels = new Uint8Array(OVERSIZE_SIDE * OVERSIZE_SIDE * RGB_CHANNELS).fill(GREY)
  const png = Buffer.from(encodePng({ width: OVERSIZE_SIDE, height: OVERSIZE_SIDE, pixels }))
  const hash = createHash('sha256').update(png).digest('hex')
  const packDir = join(parent, 'oversize-texture-pack-1.0.0')
  await mkdir(join(packDir, 'assets'), { recursive: true })
  await writeFile(join(packDir, 'assets', `${hash}.png`), png)
  for (const [name, text] of [
    ['LICENSE', 'CC0-1.0\n'],
    ['NOTICE', 'Vernacular project\n'],
    ['CHANGELOG.md', CHANGELOG],
  ]) {
    await writeFile(join(packDir, name), text)
  }
  const manifest = {
    packId: 'oversize-texture-pack',
    version: '1.0.0',
    formatVersion: 2,
    license: 'CC0-1.0',
    attribution: 'Vernacular project',
    eras: ['edwardian'],
    categories: ['flooring'],
    assets: [
      textureEntry('Oversize floorboards', hash, {
        image: { width: OVERSIZE_SIDE, height: OVERSIZE_SIDE },
        tileSize: { width: 1000, height: 1000 },
      }),
    ],
  }
  await writeFile(join(packDir, 'manifest.json'), JSON.stringify(manifest))
  return { packDir, hash, byteLength: png.length }
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

    const lines = deps.error.mock.calls.map((call) => call[0])
    expect(lines.filter((line) => /^ {2}- /.test(line))).toHaveLength(EXPECTED_BROKEN_PACK_PROBLEMS)
    const messages = lines.join('\n')
    expect(messages).toMatch(/forbids redistribution/)
    expect(messages).toMatch(/content hash does not match/)
    expect(messages).toMatch(/thumbnail missing/)
    expect(messages).toMatch(/orphan file not referenced/)
    expect(messages).toMatch(/NOTICE: required pack file missing/)
    expect(messages).toMatch(/broken-pack-1\.0\.0/)
  })

  it("lists each asset's kind and media type in the build report of the texture fixture pack", async () => {
    const deps = integrationDeps()
    const packDir = join(packsDir, 'vernacular-textures-1.0.0')

    expect(await runPackCli(['build', packDir], deps)).toBe(0)

    const manifest = await readManifestFromDisk(packDir)
    expect(deps.reports.at(-1).assets).toEqual(
      manifest.assets.map(({ name, contentHash, kind, mediaType }) => ({
        name,
        contentHash,
        kind,
        mediaType,
      })),
    )
    expect(manifest.assets.map(({ kind, mediaType }) => [kind, mediaType])).toEqual([
      ['furniture', 'model/gltf-binary'],
      ['texture', 'image/png'],
    ])
  })

  it('reports the texture field and file header problems of the broken texture pack', async () => {
    const deps = integrationDeps()
    const packDir = join(packsDir, 'broken-texture-pack-1.0.0')

    expect(await runPackCli(['validate', packDir], deps)).toBe(1)

    const messages = deps.error.mock.calls.map((call) => call[0]).join('\n')
    expect(messages).toMatch(/image\.width must be a power of two from 64 to 2048 pixels/)
    expect(messages).toMatch(/colorSpace must be one of: srgb, linear/)
    expect(messages).toMatch(/image size 64 by 64 pixels differs from the declared 128 by 128/)
    expect(messages).toMatch(/file bytes do not match the declared media type image\/webp/)
  })

  it(
    'reports a texture file above the size limit through the real command line',
    async () => {
      const parent = await mkdtemp(join(tmpdir(), 'vernacular-oversize-texture-'))
      try {
        const { packDir, hash, byteLength } = await writeOversizeTexturePack(parent)
        const deps = integrationDeps()

        expect(await runPackCli(['validate', packDir], deps)).toBe(1)

        const problems = deps.error.mock.calls
          .map((call) => call[0])
          .filter((m) => /^ {2}- /.test(m))
        expect(problems).toHaveLength(1)
        expect(problems[0]).toContain(`asset ${hash}`)
        expect(problems[0]).toContain(`${byteLength} bytes`)
        expect(problems[0]).toContain(String(TEXTURE_LIMITS.maxFileBytes))
      } finally {
        await rm(parent, { recursive: true, force: true })
      }
    },
    OVERSIZE_TEST_TIMEOUT_MS,
  )
})
