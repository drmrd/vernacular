// core/assets/asset-description.ts
//
// What a pack asset is, by media type: the media types a pack can carry, the
// file extension of each, which are models and which are textures, how a
// pack format version decides between them, and the description of each kind
// (model size, texture image size, tile size, and color space). Pure: no
// filesystem access.

// The media types a pack asset can carry.
export type MediaType = 'model/gltf-binary' | 'image/png' | 'image/webp'

/** How a texture's pixel values are interpreted: gamma-encoded color, or raw linear data. */
export type ColorSpaceName = 'srgb' | 'linear'

// The media types a pack texture can carry.
export type TextureMediaType = Extract<MediaType, `image/${string}`>

/** A model asset: its media type and its real-world size in millimeters. */
export interface ModelDescription {
  kind: 'model'
  mediaType: 'model/gltf-binary'
  dimensions: { width: number; depth: number; height: number }
}

/** A texture asset: pixel size of the image and the millimeters one repeat covers. */
export interface TextureDescription {
  kind: 'texture'
  mediaType: TextureMediaType
  image: { width: number; height: number }
  tileSize: { width: number; height: number }
  colorSpace: ColorSpaceName
}

export type AssetDescription = ModelDescription | TextureDescription

const MEDIA_TYPE_FORMAT_VERSION = 2
const FORMAT_ONE_MEDIA_TYPE: MediaType = 'model/gltf-binary'

/* eslint-disable @typescript-eslint/naming-convention -- media types are the wire keys */
const MEDIA_TYPE_EXTENSIONS: Readonly<Record<MediaType, string>> = Object.freeze({
  'model/gltf-binary': '.glb',
  'image/png': '.png',
  'image/webp': '.webp',
})
/* eslint-enable @typescript-eslint/naming-convention */

export const MODEL_MEDIA_TYPES: readonly string[] = Object.freeze(
  Object.keys(MEDIA_TYPE_EXTENSIONS).filter((type) => type.startsWith('model/')),
)
export const TEXTURE_MEDIA_TYPES: readonly string[] = Object.freeze(
  Object.keys(MEDIA_TYPE_EXTENSIONS).filter((type) => type.startsWith('image/')),
)

function isMediaType(value: unknown): value is MediaType {
  return typeof value === 'string' && Object.hasOwn(MEDIA_TYPE_EXTENSIONS, value)
}

/** The media type of a pack asset; an absent or unknown one is the format 1 default, a model. */
export function packAssetMediaType(asset: { mediaType?: string }): MediaType {
  return isMediaType(asset.mediaType) ? asset.mediaType : FORMAT_ONE_MEDIA_TYPE
}

/** The file name of a pack asset in assets/: its content hash and its media type's extension. */
export function assetFileName(contentHash: string, mediaType: MediaType): string {
  return `${contentHash}${MEDIA_TYPE_EXTENSIONS[mediaType]}`
}

/** Only format 2 packs name a media type per asset; format 1 assets are all models. */
export function declaresMediaTypes(formatVersion: unknown): boolean {
  return formatVersion === MEDIA_TYPE_FORMAT_VERSION
}

function declaresMediaTypeIn(
  asset: { mediaType?: string },
  formatVersion: unknown,
  types: readonly string[],
): boolean {
  if (!declaresMediaTypes(formatVersion)) return false
  return asset.mediaType !== undefined && types.includes(asset.mediaType)
}

/** True for every format 1 asset and, in format 2, only for a model media type; not the complement of isTextureAsset. */
export function isModelAsset(asset: { mediaType?: string }, formatVersion: unknown): boolean {
  return (
    !declaresMediaTypes(formatVersion) ||
    declaresMediaTypeIn(asset, formatVersion, MODEL_MEDIA_TYPES)
  )
}

/** True only for a format-2 asset whose declared media type is a texture type. */
export function isTextureAsset(asset: { mediaType?: string }, formatVersion: unknown): boolean {
  return declaresMediaTypeIn(asset, formatVersion, TEXTURE_MEDIA_TYPES)
}
