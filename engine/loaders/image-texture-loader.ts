import * as THREE from 'three'

export interface ImageTextureOptions {
  mediaType: 'image/png' | 'image/webp'
  colorSpace: 'srgb' | 'linear'
}

export type ImageBitmapDecoder = (
  blob: Blob,
  options: ImageBitmapOptions,
) => Promise<{ width: number; height: number; close: () => void }>

const decodeWithCreateImageBitmap: ImageBitmapDecoder = (blob, options) =>
  createImageBitmap(blob, options)

/**
 * Decodes image bytes into a repeating, mipmapped texture. The bitmap is decoded without
 * color conversion or alpha premultiplication so the declared color space is the only
 * interpretation applied.
 *
 * The decode options carry these choices, and `flipY` stays false, because three ignores its
 * own flip, premultiply, and color-conversion upload flags for an ImageBitmap. Setting
 * `flipY = true` here would not change orientation.
 */
export async function decodeImageTexture(
  bytes: Uint8Array,
  options: ImageTextureOptions,
  decode: ImageBitmapDecoder = decodeWithCreateImageBitmap,
): Promise<THREE.Texture> {
  const blob = new Blob([bytes as BlobPart], { type: options.mediaType })
  const bitmap = await decode(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
  const texture = new THREE.Texture(bitmap)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = options.colorSpace === 'srgb' ? THREE.SRGBColorSpace : THREE.NoColorSpace
  texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.flipY = false
  texture.needsUpdate = true
  return texture
}
