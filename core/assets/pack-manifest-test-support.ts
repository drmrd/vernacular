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

export function specificationAsset(): Fields {
  return {
    contentHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    byteLength: 19512,
    thumbnail: {
      contentHash: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
      byteLength: 4096,
    },
    name: 'Example armchair',
    kind: 'furniture',
    mediaType: 'model/gltf-binary',
    license: 'CC-BY-4.0',
    attribution: 'The Vernacular Contributors',
    copyright: 'Copyright 2026 The Vernacular Contributors',
    changes: 'Rebuilt the legs',
    sourceUrl: 'https://example.org/vernacular/example-armchair',
    eras: ['mid-century'],
    categories: ['seating'],
    dimensions: { width: 760, depth: 820, height: 900 },
  }
}
