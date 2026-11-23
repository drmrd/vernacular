// @vitest-environment node
import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { decodeImageTexture, type ImageBitmapDecoder } from './image-texture-loader'

const IMAGE_SIDE = 64
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47]

function fakeBitmap() {
  return { width: IMAGE_SIDE, height: IMAGE_SIDE, close: vi.fn() }
}

function expectRepeatingMipmappedTexture(texture: THREE.Texture) {
  expect(texture.wrapS).toBe(THREE.RepeatWrapping)
  expect(texture.wrapT).toBe(THREE.RepeatWrapping)
  expect(texture.generateMipmaps).toBe(true)
  expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter)
  expect(texture.flipY).toBe(false)
  expect(texture.version).toBeGreaterThan(0)
}

describe('decodeImageTexture', () => {
  it('decodes image bytes into a repeating, mipmapped texture in the declared color space', async () => {
    const bitmap = fakeBitmap()
    const decode = vi.fn<ImageBitmapDecoder>(async () => bitmap)
    const bytes = new Uint8Array(PNG_SIGNATURE)

    const srgb = await decodeImageTexture(
      bytes,
      { mediaType: 'image/png', colorSpace: 'srgb' },
      decode,
    )
    const linear = await decodeImageTexture(
      bytes,
      { mediaType: 'image/webp', colorSpace: 'linear' },
      decode,
    )

    const [srgbBlob, options] = decode.mock.calls[0]!
    const [linearBlob] = decode.mock.calls[1]!
    expect(srgbBlob.type).toBe('image/png')
    expect(linearBlob.type).toBe('image/webp')
    expect(new Uint8Array(await new Response(srgbBlob).arrayBuffer())).toEqual(bytes)
    expect(options).toEqual({ colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
    expect(srgb.image).toBe(bitmap)
    expect(srgb.colorSpace).toBe(THREE.SRGBColorSpace)
    expect(linear.colorSpace).toBe(THREE.NoColorSpace)
    expectRepeatingMipmappedTexture(srgb)
    expectRepeatingMipmappedTexture(linear)
  })
})
