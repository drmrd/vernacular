// scripts/pack/generate-fixtures.mjs
//
// Generator for the pack fixtures under tests/fixtures/packs/. It writes pack
// trees with real bytes whose hashes the integrity check can verify: a
// well-formed pack that passes, and a deliberately broken pack that exercises
// every failure path. Run with `node scripts/pack/generate-fixtures.mjs`; the
// output is committed, so re-run it only when a fixture changes. Importing this
// module has no side effects: only running it as the entry point writes to disk.

import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../tests/fixtures/packs/', import.meta.url))
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

const WELL_FORMED_PACK_DIRECTORY = 'vernacular-starter-1.0.0'
const BROKEN_PACK_DIRECTORY = 'broken-pack-wrong'

export async function writeWellFormedPack(sink) {
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
      'CHANGELOG.md': '# Changelog\n\n## 1.0.0\n\n- Initial pack.\n',
    },
  })
}

export async function writeBrokenPack(sink) {
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
      'CHANGELOG.md': '# Changelog\n\n## 1.0.0\n\n- Initial pack.\n',
    },
  })
}

export const FIXTURE_PACKS = [
  { directory: WELL_FORMED_PACK_DIRECTORY, write: writeWellFormedPack },
  { directory: BROKEN_PACK_DIRECTORY, write: writeBrokenPack },
]

const diskSink = {
  async writeFile(relativePath, bytes) {
    const target = join(root, relativePath)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, bytes)
  },
}

async function main() {
  for (const { directory, write } of FIXTURE_PACKS) {
    await rm(join(root, directory), { recursive: true, force: true })
    await write(diskSink)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
