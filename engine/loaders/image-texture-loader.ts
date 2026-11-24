import * as THREE from 'three'
import type { ColorSpaceName, TextureMediaType } from '../../core'

export interface ImageTextureOptions {
  mediaType: TextureMediaType
  colorSpace: ColorSpaceName
}

/**
 * A decoded texture with the real-world size of one repeat, in millimeters. The width runs
 * along the surface's first axis, which on the ground is world x.
 */
export interface TextureAppearance {
  texture: THREE.Texture
  tileSize: { width: number; height: number }
}

export type ImageBitmapDecoder = (
  blob: Blob,
  options: ImageBitmapOptions,
) => Promise<{ width: number; height: number; close: () => void }>

export class ImageTextureDecodeError extends Error {
  constructor(cause: unknown) {
    super('Image texture bytes could not be decoded', { cause })
    this.name = 'ImageTextureDecodeError'
  }
}

const decodeWithCreateImageBitmap: ImageBitmapDecoder = (blob, options) =>
  createImageBitmap(blob, options)

/**
 * Decodes image bytes into a repeating, mipmapped texture. The bitmap is decoded without
 * color conversion or alpha premultiplication so the declared color space is the only
 * interpretation applied.
 *
 * The decode options carry these choices. For an ImageBitmap, WebGL ignores three's flip,
 * premultiply, and color-conversion upload flags and WebGPU honors them. They stay false so
 * both backends agree.
 */
export async function decodeImageTexture(
  bytes: Uint8Array,
  options: ImageTextureOptions,
  decode: ImageBitmapDecoder = decodeWithCreateImageBitmap,
): Promise<THREE.Texture> {
  const blob = new Blob([bytes as BlobPart], { type: options.mediaType })
  const bitmap = await decode(blob, {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  }).catch((cause: unknown) => {
    throw new ImageTextureDecodeError(cause)
  })
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

function isClosable(image: unknown): image is { close(): void } {
  return typeof (image as { close?: unknown } | null | undefined)?.close === 'function'
}

/** Frees the GPU texture, then closes the decoded bitmap that backs it. */
export function disposeImageTexture(texture: THREE.Texture): void {
  texture.dispose()
  const image: unknown = texture.image
  if (isClosable(image)) image.close()
}
