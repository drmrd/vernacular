// @vitest-environment node
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  expectRefusal,
  loadFixture,
  memoryStore,
  publicationError,
  publish,
  textPath,
} from './publish-store-test-support.mjs'

const WEBP_SIDE = 64
const TILE_SIDE = 640
const SWATCH_NAME = 'Parlor swatch'
const SWATCH_LICENSE = 'CC-BY-4.0'

async function checkPackIdPortability(fixture) {
  const auxiliary = { ...fixture.manifest, packId: 'aux' }
  const auxiliaryStore = memoryStore()
  const error = await publicationError(() => publish(auxiliaryStore, fixture, auxiliary))
  expect.soft(error, 'the generated aux-1.0.0 component is portable').toBeUndefined()
  expect.soft(auxiliaryStore.files.has(textPath(auxiliary, 'NOTICE'))).toBe(true)

  const malformed = { ...fixture.manifest, packId: 'parlor-\uD800' }
  const malformedStore = memoryStore()
  await expectRefusal(malformedStore, () => publish(malformedStore, fixture, malformed), {
    label: 'pack ID contains an unpaired surrogate',
    reason: /pack|path|portable|unicode|directory/i,
  })
}

async function checkDirectoryAliases(fixture) {
  const aliases = [
    ['case', 'parlor-furniture', 'Parlor-furniture'],
    ['Unicode normalization', 'café-furniture', 'cafe\u0301-furniture'],
  ]
  for (const [label, original, alias] of aliases) {
    const store = memoryStore()
    const first = { ...fixture.manifest, packId: original }
    const second = { ...fixture.manifest, packId: alias }
    const error = await publicationError(() => publish(store, fixture, first))
    expect.soft(error, `${label} original pack`).toBeUndefined()
    if (error) continue

    await expectRefusal(store, () => publish(store, fixture, second), {
      label: `${label} alias of a published pack's text directory`,
      reason: /pack|path|portable|unicode|directory/i,
    })
    expect.soft(store.files.get(textPath(first, 'NOTICE'))).toEqual(fixture.files.get('NOTICE'))
  }
}

function swatchFixture(fixture, model) {
  const asset = {
    ...model.thumbnail,
    name: SWATCH_NAME,
    kind: 'texture',
    mediaType: 'image/webp',
    license: SWATCH_LICENSE,
    attribution: 'Sam Lee',
    eras: ['mid-century'],
    categories: ['swatches'],
    image: { width: WEBP_SIDE, height: WEBP_SIDE },
    tileSize: { width: TILE_SIDE, height: TILE_SIDE },
    colorSpace: 'srgb',
  }
  const bytes = fixture.files.get(join('thumbnails', `${model.contentHash}.webp`))
  const files = new Map(fixture.files)
  files.set(join('assets', `${asset.contentHash}.webp`), bytes)
  return { files, asset }
}

async function checkNamedThumbnailRights(fixture) {
  const [sofa, ...otherAssets] = fixture.manifest.assets
  const swatch = swatchFixture(fixture, sofa)
  const manifest = {
    ...fixture.manifest,
    packId: 'parlor-swatches',
    attribution: swatch.asset.attribution,
    assets: [swatch.asset],
  }
  const store = memoryStore()
  const original = {
    ...fixture.manifest,
    assets: [{ ...sofa, license: SWATCH_LICENSE }, ...otherAssets],
  }
  await publish(store, fixture, original)
  await publish(store, fixture, { ...fixture.manifest, version: '1.1.0' })
  await publish(store, fixture, { ...fixture.manifest, version: '1.2.0', assets: otherAssets })

  await expectRefusal(store, () => publish(store, swatch, manifest), {
    label: 'a different pack narrows rights on a historical thumbnail used as a texture',
    reason: /licen[sc]e|Parlor swatch/i,
  })

  const firstRelease = memoryStore()
  const together = { ...manifest, assets: [sofa, swatch.asset] }
  const error = await publicationError(() => publish(firstRelease, swatch, together))
  expect
    .soft(error, 'same-release references are checked against published history only')
    .toBeUndefined()
}

async function checkIncomingThumbnailRights(fixture) {
  const [sofa, lamp] = fixture.manifest.assets
  const swatch = swatchFixture(fixture, sofa)
  const original = { ...fixture.manifest, assets: [{ ...swatch.asset, license: 'CC0-1.0' }] }
  const store = memoryStore()
  await publish(store, swatch, original)

  const files = new Map(fixture.files)
  files.set(
    join('thumbnails', `${lamp.contentHash}.webp`),
    fixture.files.get(join('thumbnails', `${sofa.contentHash}.webp`)),
  )
  const manifest = {
    ...fixture.manifest,
    packId: 'parlor-lighting',
    assets: [{ ...lamp, thumbnail: sofa.thumbnail }],
  }
  await expectRefusal(store, () => publish(store, { files }, manifest), {
    label: 'a different pack narrows rights on a historical texture used as a thumbnail',
    reason: /licen[sc]e|Example lamp/i,
  })
}

async function checkLegacyThumbnail(fixture) {
  const [sofa] = fixture.manifest.assets
  const model = { ...sofa }
  delete model.mediaType
  delete model.byteLength
  delete model.thumbnail
  const legacy = { ...fixture.manifest, formatVersion: 1, assets: [model] }
  const swatch = swatchFixture(fixture, sofa)
  const manifest = { ...fixture.manifest, packId: 'parlor-swatches', assets: [swatch.asset] }
  const store = memoryStore()

  await publish(store, fixture, legacy)
  const error = await publicationError(() => publish(store, swatch, manifest))

  expect.soft(error, 'the legacy thumbnail had no declared hash').toBeUndefined()
}

describe('publishPack with portable paths and licensed files', () => {
  it('guards equivalent text directories and keeps historical thumbnail rights on the bytes', async () => {
    const fixture = await loadFixture()

    await checkPackIdPortability(fixture)
    await checkDirectoryAliases(fixture)
    await checkNamedThumbnailRights(fixture)
    await checkIncomingThumbnailRights(fixture)
    await checkLegacyThumbnail(fixture)
  })
})
