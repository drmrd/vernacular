import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const PACK_ID = 'example-furniture'
const VERSION = '1.0.0'
const FORMAT_VERSION = 2
const ATTRIBUTION = 'Jane Roe'
const ERAS = ['mid-century']

export const EXAMPLE_FURNITURE_DIRECTORY = `${PACK_ID}-${VERSION}`

const FURNITURE = [
  {
    slug: 'sofa',
    name: 'Example sofa',
    license: 'CC0-1.0',
    category: 'seating',
    dimensions: { width: 1000, depth: 1000, height: 2000 },
  },
  {
    slug: 'lamp',
    name: 'Example lamp',
    license: 'CC-BY-4.0',
    copyright: 'Copyright 2026 Jane Roe',
    sourceUrl: 'https://example.org/vernacular/fixtures/example-lamp',
    category: 'lighting',
    dimensions: { width: 300, depth: 300, height: 1500 },
    appearance: { scale: [0.3, 0.75, 0.3], color: [0.7, 0.37, 0.15, 1] },
  },
  {
    slug: 'settee',
    name: 'Example settee',
    license: 'CC-BY-SA-4.0',
    changes: 'Rescaled the original mesh and changed its finish to blue.',
    category: 'seating',
    dimensions: { width: 1500, depth: 700, height: 700 },
    appearance: { scale: [1.5, 0.35, 0.7], color: [0.13, 0.37, 0.8, 1] },
  },
]

const NOTICE = `Example furniture test pack

Jane Roe and the lamp's source URL are sample manifest data.

The sofa copies the repository's e2e/fixtures/cube.glb byte for byte. The
lamp and settee use scaled and recolored versions of the same mesh.

Example sofa (CC0-1.0, Jane Roe)
https://creativecommons.org/publicdomain/zero/1.0/

Example lamp (CC-BY-4.0, Jane Roe)
https://creativecommons.org/licenses/by/4.0/

Example settee (CC-BY-SA-4.0, Jane Roe)
https://creativecommons.org/licenses/by-sa/4.0/
`

const CHANGELOG = '## 1.0.0\n\nAdd the sofa, lamp, and settee used by the publishing tests.\n'

const GLB_LENGTH_OFFSET = 8
const JSON_LENGTH_OFFSET = 12
const JSON_DATA_OFFSET = 20
const CHUNK_ALIGNMENT = 4

function styleCube(cube, { scale, color }) {
  const jsonEnd = JSON_DATA_OFFSET + cube.readUInt32LE(JSON_LENGTH_OFFSET)
  const document = JSON.parse(cube.toString('utf8', JSON_DATA_OFFSET, jsonEnd))
  delete document.asset.generator
  document.nodes[0] = { scale, mesh: document.nodes[0].mesh }
  document.materials[0].pbrMetallicRoughness.baseColorFactor = color

  const json = Buffer.from(JSON.stringify(document))
  const paddedSize = Math.ceil(json.length / CHUNK_ALIGNMENT) * CHUNK_ALIGNMENT
  const padding = Buffer.alloc(paddedSize - json.length, ' ')
  const header = cube.subarray(0, JSON_DATA_OFFSET)
  const model = Buffer.concat([header, json, padding, cube.subarray(jsonEnd)])
  model.writeUInt32LE(model.length, GLB_LENGTH_OFFSET)
  model.writeUInt32LE(paddedSize, JSON_LENGTH_OFFSET)
  return model
}

function describeFile(bytes) {
  return { contentHash: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.length }
}

function describeAsset(model, thumbnail, { name, license, category, dimensions, ...credits }) {
  return {
    ...describeFile(model),
    thumbnail: describeFile(thumbnail),
    name,
    kind: 'furniture',
    mediaType: 'model/gltf-binary',
    license,
    attribution: ATTRIBUTION,
    ...credits,
    eras: ERAS,
    categories: [category],
    dimensions,
  }
}

async function writeAssets(write, cube) {
  const assets = []
  for (const { slug, appearance, ...fields } of FURNITURE) {
    const model = appearance ? styleCube(cube, appearance) : cube
    const thumbnail = await readFile(new URL(`./${slug}.webp`, import.meta.url))
    const asset = describeAsset(model, thumbnail, fields)
    await write(`assets/${asset.contentHash}.glb`, model)
    await write(`thumbnails/${asset.contentHash}.webp`, thumbnail)
    assets.push(asset)
  }
  return assets
}

async function licenseText() {
  const licenses = ['./CC0-1.0.txt', '../starter/CC-BY-4.0.txt', './CC-BY-SA-4.0.txt']
  const texts = await Promise.all(
    licenses.map((source) => readFile(new URL(source, import.meta.url), 'utf8')),
  )
  return texts.join('\n\n')
}

export async function writeExampleFurniturePack(sink) {
  const write = (path, bytes) => sink.writeFile(`${EXAMPLE_FURNITURE_DIRECTORY}/${path}`, bytes)
  const cube = await readFile(new URL('../../../e2e/fixtures/cube.glb', import.meta.url))
  const manifest = {
    packId: PACK_ID,
    version: VERSION,
    formatVersion: FORMAT_VERSION,
    license: 'CC-BY-4.0',
    attribution: ATTRIBUTION,
    eras: ERAS,
    categories: ['seating', 'lighting'],
    assets: await writeAssets(write, cube),
  }
  await write('LICENSE', await licenseText())
  await write('NOTICE', NOTICE)
  await write('CHANGELOG.md', CHANGELOG)
  // Preserve the original manifest bytes because the store addresses them by hash.
  await write('manifest.json', `${JSON.stringify(manifest, null, 2).replace('{\n', '{\n\n')}\n`)
}
