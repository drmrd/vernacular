import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Activity } from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { Texture } from '../../engine/testing'
import { LOADING } from './texture-cache'
import type { TextureState } from './texture-cache'
import {
  handedOutTextures,
  recordingProbe,
  drainTasks,
  reference,
  stubImageDecoding,
  type FakeBitmap,
} from './use-ground-texture-test-support'

/** Gives a load that the hook might start the turns it needs to decode and settle. */
async function letLoadsSettle(): Promise<void> {
  await act(drainTasks)
}

describe('useGroundTexture across hide and show', () => {
  let decoded: FakeBitmap[]

  beforeEach(() => {
    decoded = stubImageDecoding()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('a view hidden and shown again under <Activity> loads a fresh texture, never the freed one', async () => {
    const disposeTexture = vi.spyOn(Texture.prototype, 'dispose')
    const received: TextureState[] = []
    const Probe = recordingProbe(received)
    const inMode = (mode: 'visible' | 'hidden') => (
      <Activity mode={mode}>
        <Probe />
      </Activity>
    )
    const view = render(inMode('visible'), { reactStrictMode: true })
    await waitFor(() => expect(received.at(-1)?.status).toBe('ready'))
    const freedAtHide = received.at(-1)?.appearance?.texture
    expect(freedAtHide).toBeInstanceOf(Texture)

    view.rerender(inMode('hidden'))
    await letLoadsSettle()
    expect(disposeTexture.mock.contexts).toContain(freedAtHide)

    const renderedBeforeShow = received.length
    view.rerender(inMode('visible'))
    await letLoadsSettle()

    const afterShow = received.slice(renderedBeforeShow)
    expect(handedOutTextures(afterShow), 'the texture freed at hide').not.toContain(freedAtHide)
    expect(afterShow[0]).toEqual(LOADING)
    const shown = afterShow.at(-1)?.appearance?.texture
    expect(afterShow.at(-1)?.status).toBe('ready')
    expect(shown).toBeInstanceOf(Texture)
    expect(disposeTexture.mock.contexts).not.toContain(shown)
  })

  it('a fresh reference object equal to the current one keeps the texture without a reload', async () => {
    const received: TextureState[] = []
    const Probe = recordingProbe(received)
    const view = render(<Probe asset={reference} />)
    await waitFor(() => expect(received.at(-1)?.status).toBe('ready'))
    const texture = received.at(-1)?.appearance?.texture
    expect(decoded).toHaveLength(1)

    const renderedBeforeRerender = received.length
    view.rerender(<Probe asset={{ ...reference }} />)
    await letLoadsSettle()

    const afterRerender = received.slice(renderedBeforeRerender)
    expect(afterRerender.length).toBeGreaterThan(0)
    expect(afterRerender.map((state) => state.appearance?.texture)).toEqual(
      afterRerender.map(() => texture),
    )
    expect(decoded).toHaveLength(1)
  })
})
