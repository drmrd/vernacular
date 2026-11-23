import { PackSource } from './pack-source'

export const GRASS_HASH = '1111111111111111111111111111111111111111111111111111111111111111'

/** A real PackSource over a one-texture pack; its id stays a placeholder until its manifest loads. */
export const texturePackWithTileSize = (packId: string, tileSize: number): PackSource =>
  new PackSource({
    manifest: async () => ({
      packId,
      version: '1.0.0',
      formatVersion: 2,
      license: 'CC0-1.0',
      attribution: 'Vernacular project',
      eras: ['mid-century'],
      categories: ['ground'],
      assets: [
        {
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
        },
      ],
    }),
    readAsset: async () => undefined,
    readThumbnail: async () => undefined,
  })
