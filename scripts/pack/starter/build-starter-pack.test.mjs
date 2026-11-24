// @vitest-environment node
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { builtinPeriods } from '../../../core/registries/periods.ts'
import { encodePng } from '../png-encoder.mjs'
import { createNodePackReader, readManifestFromDisk, runPackCli } from '../vernacular-pack.mjs'
import { buildStarterPack } from './build-starter-pack.mjs'
import { generateGrassTile } from './grass-tile.mjs'

// Vitest runs with the project root as the working directory.
const NEW_PACK_DIR = resolve('public/packs/vernacular-starter-1.1.0')
const OLD_PACK_DIR = resolve('public/packs/vernacular-starter-1.0.0')
const OLD_CHAIR_HASH = '8a8a0cafbecb2446278c8b61e275c1ac78373a7ccd59ddd5ac7684bf1388341e'
const LICENSE_ID = 'CC-BY-4.0'
const ATTRIBUTION = 'The Vernacular Contributors'
const GRASS_SIDE = 512
const GRASS_TILE_MM = 2000
const LICENSE_HEADING = 'Attribution 4.0 International'
const LICENSE_FIRST_SECTION = 'Section 1 -- Definitions.'
const GENERATOR_SCRIPT = 'scripts/pack/starter/build-starter-pack.mjs'
const GENERATOR_COMMAND = 'pnpm pack:starter'
const OLD_CHANGELOG_HEADING = '## 1.0.0'
const NEW_CHANGELOG_HEADING = '## 1.1.0'
const NEW_CHANGELOG_TEXT =
  'Replace the placeholder chair with a new placeholder chair under CC-BY-4.0. ' +
  'Add a generated mown-grass texture.'

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function sameBytes(a, b) {
  return Buffer.from(a).equals(Buffer.from(b))
}

/** Every file below `dir`, keyed by its pack-relative path with forward slashes. */
async function readCommittedFiles(dir, prefix = '') {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (cause) {
    throw new Error(`The committed pack directory ${dir} could not be read: ${String(cause)}`)
  }
  const files = new Map()
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      const nested = await readCommittedFiles(join(dir, entry.name), relative)
      nested.forEach((bytes, path) => files.set(path, bytes))
    } else {
      files.set(relative, new Uint8Array(await readFile(join(dir, entry.name))))
    }
  }
  return files
}

function assetOfKind(manifest, kind) {
  const found = manifest.assets.filter((asset) => asset.kind === kind)
  expect(found, `assets of kind ${kind}`).toHaveLength(1)
  return found[0]
}

function collectingDeps() {
  const lines = []
  return {
    lines,
    readManifest: readManifestFromDisk,
    createReader: createNodePackReader,
    writeReport: () => Promise.resolve(),
    log: (line) => lines.push(line),
    error: (line) => lines.push(line),
  }
}

describe('the starter pack 1.1.0 build', () => {
  let built

  beforeAll(async () => {
    built = await buildStarterPack()
  })

  it('writes exactly the files committed under the 1.1.0 pack directory', async () => {
    const committed = await readCommittedFiles(NEW_PACK_DIR)

    const differing = [...built].filter(
      ([path, bytes]) => !committed.has(path) || !sameBytes(bytes, committed.get(path)),
    )
    const missingFromBuild = [...committed.keys()].filter((path) => !built.has(path))

    expect(differing.map(([path]) => path)).toEqual([])
    expect(missingFromBuild).toEqual([])
  })

  it('passes the pack validator with the real readers', async () => {
    const deps = collectingDeps()

    const exitCode = await runPackCli(['validate', NEW_PACK_DIR], deps)

    expect(exitCode, deps.lines.join('\n')).toBe(0)
  })

  it('declares the starter pack at version 1.1.0 in format 2 under CC-BY-4.0', async () => {
    const manifest = await readManifestFromDisk(NEW_PACK_DIR)

    expect(manifest).toMatchObject({
      formatVersion: 2,
      version: '1.1.0',
      packId: 'vernacular-starter',
      license: LICENSE_ID,
    })
  })

  it('replaces the chair with a new one that keeps the old chair description', async () => {
    const manifest = await readManifestFromDisk(NEW_PACK_DIR)
    const oldChair = assetOfKind(await readManifestFromDisk(OLD_PACK_DIR), 'furniture')
    const chair = assetOfKind(manifest, 'furniture')
    const chairBytes = built.get(`assets/${chair.contentHash}.glb`)

    expect(chair).toMatchObject({
      name: oldChair.name,
      styles: oldChair.styles,
      eras: oldChair.eras,
      categories: oldChair.categories,
      dimensions: oldChair.dimensions,
      license: LICENSE_ID,
      attribution: ATTRIBUTION,
    })
    expect(oldChair.contentHash).toBe(OLD_CHAIR_HASH)
    expect(chair.contentHash).not.toBe(OLD_CHAIR_HASH)
    expect(chairBytes, 'chair bytes in the build').toBeDefined()
    expect(sha256(chairBytes)).toBe(chair.contentHash)
    const oldBytes = await readFile(join(OLD_PACK_DIR, 'assets', `${OLD_CHAIR_HASH}.glb`))
    expect(sameBytes(chairBytes, oldBytes)).toBe(false)
  })

  it('adds a tileable mown-grass texture covering every period', async () => {
    const manifest = await readManifestFromDisk(NEW_PACK_DIR)
    const grass = assetOfKind(manifest, 'texture')
    const committedPng = await readFile(join(NEW_PACK_DIR, 'assets', `${grass.contentHash}.png`))

    expect(grass).toMatchObject({
      mediaType: 'image/png',
      image: { width: GRASS_SIDE, height: GRASS_SIDE },
      tileSize: { width: GRASS_TILE_MM, height: GRASS_TILE_MM },
      colorSpace: 'srgb',
      categories: ['ground-cover'],
      license: LICENSE_ID,
      attribution: ATTRIBUTION,
    })
    expect([...grass.eras].sort()).toEqual(Object.keys(builtinPeriods.entries).sort())
    expect(sameBytes(committedPng, encodePng(generateGrassTile()))).toBe(true)
    expect(sha256(committedPng)).toBe(grass.contentHash)
  })

  it('ships the full CC-BY-4.0 text, a notice naming the generator, and a changelog', async () => {
    const text = async (name) => readFile(join(NEW_PACK_DIR, name), 'utf8')

    const license = await text('LICENSE')
    const notice = await text('NOTICE')
    const changelog = await text('CHANGELOG.md')

    expect(license.startsWith(LICENSE_HEADING)).toBe(true)
    expect(license).toContain(LICENSE_FIRST_SECTION)
    expect(notice).toContain(GENERATOR_SCRIPT)
    expect(notice).toContain(GENERATOR_COMMAND)
    expect(changelog).toContain(OLD_CHANGELOG_HEADING)
    const newSection = changelog.split(NEW_CHANGELOG_HEADING)[1] ?? ''
    expect(newSection.replace(/\s+/g, ' ')).toContain(NEW_CHANGELOG_TEXT)
  })
})
