// scripts/pack/generate-fixtures.mjs
//
// One-shot generator for the pack fixtures under tests/fixtures/packs/. It writes
// two pack trees with real bytes whose hashes the integrity check can verify:
// a well-formed pack that passes, and a deliberately broken pack that exercises
// every failure path. Run with `node scripts/pack/generate-fixtures.mjs`; the
// output is committed, so this script only needs re-running when a fixture changes.

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
 * Write a pack tree: every entry of `files` is a path relative to the pack
 * directory, and the manifest is serialized last.
 * @param {string} name pack directory name under tests/fixtures/packs/
 * @param {object} manifest
 * @param {Record<string, Buffer | string>} files
 */
async function writePack(name, manifest, files) {
  const dir = join(root, name)
  await rm(dir, { recursive: true, force: true })
  for (const [rel, bytes] of Object.entries(files)) {
    await mkdir(dirname(join(dir, rel)), { recursive: true })
    await writeFile(join(dir, rel), bytes)
  }
  await writeFile(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}

async function writeWellFormedPack() {
  const glb = Buffer.from('vernacular starter chair glb placeholder\n')
  const hash = sha256(glb)
  await writePack(
    'vernacular-starter-1.0.0',
    {
      packId: 'vernacular-starter',
      version: '1.0.0',
      license: 'CC0-1.0',
      attribution: 'Vernacular project',
      eras: ['mid-century'],
      categories: ['seating'],
      assets: [
        {
          contentHash: hash,
          name: 'Example chair',
          kind: 'furniture',
          license: 'CC0-1.0',
          attribution: 'Vernacular project',
          eras: ['mid-century'],
          categories: ['seating'],
          dimensions: { width: 500, depth: 520, height: 800 },
        },
      ],
    },
    {
      [`assets/${hash}.glb`]: glb,
      [`thumbnails/${hash}.webp`]: webp,
      LICENSE: 'CC0-1.0\n',
      NOTICE: 'Vernacular project\n',
      'CHANGELOG.md': '# Changelog\n\n## 1.0.0\n\n- Initial pack.\n',
    },
  )
}

async function writeBrokenPack() {
  // The asset file's real bytes hash to something other than the declared hash, so
  // the integrity check reports a mismatch. The directory name, license, thumbnail,
  // orphan file, and missing NOTICE each trip a distinct failure path.
  const declaredHash = sha256(Buffer.from('the bytes this hash was computed from\n'))
  await writePack(
    'broken-pack-wrong',
    {
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
    {
      [`assets/${declaredHash}.glb`]: Buffer.from('these are not the declared bytes\n'),
      'assets/orphan.glb': Buffer.from('an orphan asset no manifest entry references\n'),
      LICENSE: 'CC-BY-NC-4.0\n',
      'CHANGELOG.md': '# Changelog\n\n## 1.0.0\n\n- Initial pack.\n',
    },
  )
}

async function main() {
  await writeWellFormedPack()
  await writeBrokenPack()
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
