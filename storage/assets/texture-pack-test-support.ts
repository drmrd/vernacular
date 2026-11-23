import { PackSource } from './pack-source'

const HASH_LENGTH = 64
export const GRASS_HASH = '1'.repeat(HASH_LENGTH)

/** A format 2 manifest entry for a mown-grass texture tiled at the given size. */
export const grassTextureAsset = (tileSize: number) => ({
  contentHash: GRASS_HASH,
  name: 'Mown grass',
  kind: 'texture',
  mediaType: 'image/png',
  image: { width: 256, height: 256 },
  tileSize: { width: tileSize, height: tileSize },
  colorSpace: 'srgb',
  license: 'CC0-1.0',
  attribution: 'Vernacular project',
  eras: ['mid-century'],
  categories: ['ground'],
})

/** A real PackSource over a one-texture pack; its id stays unknown until its manifest loads. */
export const texturePackSource = (packId: string, tileSize: number): PackSource =>
  new PackSource({
    manifest: async () => ({
      packId,
      version: '1.0.0',
      formatVersion: 2,
      license: 'CC0-1.0',
      attribution: 'Vernacular project',
      eras: ['mid-century'],
      categories: ['ground'],
      assets: [grassTextureAsset(tileSize)],
    }),
    readAsset: async () => undefined,
    readThumbnail: async () => undefined,
  })
