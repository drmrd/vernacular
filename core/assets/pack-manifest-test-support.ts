// core/assets/pack-manifest-test-support.ts
const HASH_LENGTH = 64

type Fields = Record<string, unknown>

export function validManifest(): Fields {
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

export function validTextureAsset(): Fields {
  return {
    contentHash: '1'.repeat(HASH_LENGTH),
    name: 'Mown grass',
    kind: 'texture',
    mediaType: 'image/png',
    image: { width: 256, height: 256 },
    tileSize: { width: 1000, height: 1000 },
    colorSpace: 'srgb',
    license: 'CC0-1.0',
    attribution: 'Vernacular project',
    eras: ['mid-century'],
    categories: ['ground'],
  }
}

export function manifestWith(texture: Fields): Fields {
  return {
    packId: 'vernacular-textures',
    version: '1.0.0',
    formatVersion: 2,
    license: 'CC0-1.0',
    attribution: 'Vernacular project',
    eras: ['mid-century'],
    categories: ['ground'],
    assets: [texture],
  }
}
