// scripts/pack/generate-fixtures.mjs
//
// Generates packs under tests/fixtures/packs/ and publishes the example store
// under tests/fixtures/store/. The pack fixtures include a model pack and a
// texture pack that pass the integrity check, plus a deliberately broken pack
// of each type. Run with
// `node scripts/pack/generate-fixtures.mjs`; the output is committed, so re-run
// it only when a fixture changes. Importing this module has no side effects:
// only running it as the entry point writes to disk.

import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CATALOG_FILE } from '../../core/assets/store-paths.ts'
import { encodePng } from './png-encoder.mjs'
import {
  EXAMPLE_FURNITURE_DIRECTORY,
  writeExampleFurniturePack,
} from './example-furniture/build-example-furniture.mjs'
import { publishPackToDisk } from './publish-store.mjs'

const fixturesRoot = fileURLToPath(new URL('../../tests/fixtures/', import.meta.url))
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')

// A minimal 12-byte WebP header: "RIFF" + a four-byte size + "WEBP". Enough for the
// integrity check, which validates the signature rather than decoding the image.
const webp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x04, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])

/**
 * Write a pack tree through `sink`: every entry of `files` is a path relative
 * to the pack directory, and the manifest is serialized last.
 * @param {{ writeFile(relativePath: string, bytes: Buffer | string): Promise<void> }} sink
 * @param {{ directory: string, manifest: object, files: Record<string, Buffer | string> }} pack
 *   `directory` is the pack directory name under tests/fixtures/packs/
 */
async function writePack(sink, { directory, manifest, files }) {
  for (const [rel, bytes] of Object.entries(files)) {
    await sink.writeFile(`${directory}/${rel}`, bytes)
  }
  await sink.writeFile(`${directory}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`)
}

export const CHANGELOG = '# Changelog\n\n## 1.0.0\n\n- Initial pack.\n'
const WELL_FORMED_PACK_DIRECTORY = 'vernacular-starter-1.0.0'
const BROKEN_PACK_DIRECTORY = 'broken-pack-wrong'

async function writeWellFormedPack(sink) {
  const glb = Buffer.from('vernacular starter chair glb placeholder\n')
  const hash = sha256(glb)
  await writePack(sink, {
    directory: WELL_FORMED_PACK_DIRECTORY,
    manifest: {
      packId: 'vernacular-starter',
      version: '1.0.0',
      license: 'CC0-1.0',
      attribution: 'Vernacular project',
      eras: ['mid-century'],
      styles: ['mid-century-modern'],
      categories: ['seating'],
      assets: [
        {
          contentHash: hash,
          name: 'Example chair',
          kind: 'furniture',
          license: 'CC0-1.0',
          attribution: 'Vernacular project',
          eras: ['mid-century'],
          styles: ['mid-century-modern'],
          categories: ['seating'],
          dimensions: { width: 500, depth: 520, height: 800 },
        },
      ],
    },
    files: {
      [`assets/${hash}.glb`]: glb,
      [`thumbnails/${hash}.webp`]: webp,
      LICENSE: 'CC0-1.0\n',
      NOTICE: 'Vernacular project\n',
      'CHANGELOG.md': CHANGELOG,
    },
  })
}

async function writeBrokenPack(sink) {
  // The asset file's real bytes hash to something other than the declared hash, so
  // the integrity check reports a mismatch. The directory name, license, thumbnail,
  // orphan file, and missing NOTICE each trip a distinct failure path.
  const declaredHash = sha256(Buffer.from('the bytes this hash was computed from\n'))
  await writePack(sink, {
    directory: BROKEN_PACK_DIRECTORY,
    manifest: {
      packId: 'broken-pack',
      version: '1.0.0',
      license: 'CC0-1.0',
      attribution: 'Vernacular project',
      eras: ['edwardian'],
      categories: ['seating'],
      assets: [
        {
          contentHash: declaredHash,
          name: 'Broken chair',
          kind: 'furniture',
          license: 'CC-BY-NC-4.0',
          attribution: 'Vernacular project',
          eras: ['edwardian'],
          categories: ['seating'],
          dimensions: { width: 500, depth: 520, height: 800 },
        },
      ],
    },
    files: {
      [`assets/${declaredHash}.glb`]: Buffer.from('these are not the declared bytes\n'),
      'assets/orphan.glb': Buffer.from('an orphan asset no manifest entry references\n'),
      LICENSE: 'CC-BY-NC-4.0\n',
      'CHANGELOG.md': CHANGELOG,
    },
  })
}

const TEXTURE_PACK_DIRECTORY = 'vernacular-textures-1.0.0'
const BROKEN_TEXTURE_PACK_DIRECTORY = 'broken-texture-pack-1.0.0'
const TEXTURE_SIDE = 64
const RGB_CHANNELS = 3
const UINT8_RANGE = 256
const TILE_SIZE_MM = 600
const NOT_POWER_OF_TWO_SIDE = 100
const WELL_FORMED_TEXTURE_TINT = 0x40
const WRONG_SIZE_TINT = 0x10
const WRONG_MEDIA_TYPE_TINT = 0x20
const WRONG_FIELDS_TINT = 0x30

/**
 * A square RGB PNG whose pixels differ by `tint`, so each tint hashes differently.
 * @param {number} side
 * @param {number} tint 0 to 255
 * @returns {Buffer}
 */
function tintedPng(side, tint) {
  const pixels = new Uint8Array(side * side * RGB_CHANNELS)
  pixels.forEach((_, index) => {
    pixels[index] = index % RGB_CHANNELS === 0 ? tint : (index + tint) % UINT8_RANGE
  })
  return Buffer.from(encodePng({ width: side, height: side, pixels }))
}

/** A texture entry of a format 2 manifest; `overrides` replaces any field. */
export function textureEntry(name, hash, overrides = {}) {
  return {
    contentHash: hash,
    name,
    kind: 'texture',
    mediaType: 'image/png',
    license: 'CC0-1.0',
    attribution: 'Vernacular project',
    eras: ['edwardian'],
    categories: ['flooring'],
    image: { width: TEXTURE_SIDE, height: TEXTURE_SIDE },
    tileSize: { width: TILE_SIZE_MM, height: TILE_SIZE_MM },
    colorSpace: 'srgb',
    ...overrides,
  }
}

async function writeTexturePack(sink) {
  const glb = Buffer.from('vernacular textures stool glb placeholder\n')
  const stoolHash = sha256(glb)
  const png = tintedPng(TEXTURE_SIDE, WELL_FORMED_TEXTURE_TINT)
  const textureHash = sha256(png)
  await writePack(sink, {
    directory: TEXTURE_PACK_DIRECTORY,
    manifest: {
      packId: 'vernacular-textures',
      version: '1.0.0',
      formatVersion: 2,
      license: 'CC0-1.0',
      attribution: 'Vernacular project',
      eras: ['edwardian'],
      categories: ['seating', 'flooring'],
      assets: [
        {
          contentHash: stoolHash,
          name: 'Example stool',
          kind: 'furniture',
          mediaType: 'model/gltf-binary',
          license: 'CC0-1.0',
          attribution: 'Vernacular project',
          eras: ['edwardian'],
          categories: ['seating'],
          dimensions: { width: 350, depth: 350, height: 450 },
        },
        textureEntry('Example floorboards', textureHash),
      ],
    },
    files: {
      [`assets/${stoolHash}.glb`]: glb,
      [`assets/${textureHash}.png`]: png,
      [`thumbnails/${stoolHash}.webp`]: webp,
      LICENSE: 'CC0-1.0\n',
      NOTICE: 'Vernacular project\n',
      'CHANGELOG.md': CHANGELOG,
    },
  })
}

async function writeBrokenTexturePack(sink) {
  // Three small textures with matching hashes. The first declares 128 by 128 over a 64 by 64
  // file. The second declares WebP over PNG bytes. The third declares a side that is not a
  // power of two and an unknown color space.
  const smaller = tintedPng(TEXTURE_SIDE, WRONG_SIZE_TINT)
  const pngAsWebp = tintedPng(TEXTURE_SIDE, WRONG_MEDIA_TYPE_TINT)
  const badFields = tintedPng(TEXTURE_SIDE, WRONG_FIELDS_TINT)
  const sizeHash = sha256(smaller)
  const typeHash = sha256(pngAsWebp)
  const fieldsHash = sha256(badFields)
  const declaredSide = TEXTURE_SIDE * 2
  await writePack(sink, {
    directory: BROKEN_TEXTURE_PACK_DIRECTORY,
    manifest: {
      packId: 'broken-texture-pack',
      version: '1.0.0',
      formatVersion: 2,
      license: 'CC0-1.0',
      attribution: 'Vernacular project',
      eras: ['edwardian'],
      categories: ['flooring'],
      assets: [
        textureEntry('Wrong size', sizeHash, {
          image: { width: declaredSide, height: declaredSide },
        }),
        textureEntry('Wrong media type', typeHash, { mediaType: 'image/webp' }),
        textureEntry('Wrong fields', fieldsHash, {
          image: { width: NOT_POWER_OF_TWO_SIDE, height: TEXTURE_SIDE },
          colorSpace: 'display-p3',
        }),
      ],
    },
    files: {
      [`assets/${sizeHash}.png`]: smaller,
      [`assets/${typeHash}.webp`]: pngAsWebp,
      [`assets/${fieldsHash}.png`]: badFields,
      LICENSE: 'CC0-1.0\n',
      NOTICE: 'Vernacular project\n',
      'CHANGELOG.md': CHANGELOG,
    },
  })
}

export const FIXTURE_PACKS = [
  { directory: WELL_FORMED_PACK_DIRECTORY, write: writeWellFormedPack },
  { directory: BROKEN_PACK_DIRECTORY, write: writeBrokenPack },
  { directory: TEXTURE_PACK_DIRECTORY, write: writeTexturePack },
  { directory: BROKEN_TEXTURE_PACK_DIRECTORY, write: writeBrokenTexturePack },
  { directory: EXAMPLE_FURNITURE_DIRECTORY, write: writeExampleFurniturePack },
]

const STORE_STARTER_PACKS = ['vernacular-starter-1.0.0', 'vernacular-starter-1.1.1'].map(
  (directory) => fileURLToPath(new URL(`../../public/packs/${directory}`, import.meta.url)),
)

/** @param {string} storeDir A directory reserved for generated store output. */
export async function generateFixtureStore(
  storeDir,
  furniturePackDir = join(fixturesRoot, 'packs', EXAMPLE_FURNITURE_DIRECTORY),
) {
  for (const path of [CATALOG_FILE, 'blobs', 'manifests', 'packs']) {
    await rm(join(storeDir, path), { recursive: true, force: true })
  }
  for (const packDir of [...STORE_STARTER_PACKS, furniturePackDir]) {
    await publishPackToDisk({ packDir, storeDir, name: 'Example Library' })
  }
}

async function main(fixturesDirectory = fixturesRoot) {
  const packsDirectory = join(fixturesDirectory, 'packs')
  const diskSink = {
    async writeFile(relativePath, bytes) {
      const target = join(packsDirectory, relativePath)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, bytes)
    },
  }
  for (const { directory, write } of FIXTURE_PACKS) {
    await rm(join(packsDirectory, directory), { recursive: true, force: true })
    await write(diskSink)
  }
  await generateFixtureStore(
    join(fixturesDirectory, 'store'),
    join(packsDirectory, EXAMPLE_FURNITURE_DIRECTORY),
  )
}

export { main as generateFixtures }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
