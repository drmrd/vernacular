import { expect, it } from 'vitest'
import { decodeImageTexture } from './image-texture-loader'
import texturePngUrl from '../../tests/fixtures/packs/vernacular-textures-1.0.0/assets/e3df42313b00ecea90837a7e23fa1a6b820aa0905a3b49d89335399c8d6b18ac.png?url'

const FIXTURE_SIDE = 64

it('decodes the committed texture image in a real browser with the default decoder', async () => {
  const response = await fetch(texturePngUrl)
  expect(response.ok).toBe(true)
  const bytes = new Uint8Array(await response.arrayBuffer())

  const texture = await decodeImageTexture(bytes, { mediaType: 'image/png', colorSpace: 'srgb' })

  const image = texture.image as { width: number; height: number }
  expect([image.width, image.height]).toEqual([FIXTURE_SIDE, FIXTURE_SIDE])
})
