import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startTransition, useLayoutEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { render, waitFor } from '@testing-library/react'
import { resolvedAsset } from '../../core'
import type { AssetReference } from '../../core'
import { Texture } from '../../engine/testing'
import { LOADING } from './texture-cache'
import type { TextureState } from './texture-cache'
import { useGroundTexture } from './use-ground-texture'
import {
  handedOutTextures,
  holdableSource,
  otherReference,
  drainTasks,
  recordingProbe,
  reference,
  stubImageDecoding,
  type Deferred,
  type FakeBitmap,
  type ProbeProps,
} from './use-ground-texture-test-support'

type Journey = {
  first: ProbeProps
  change: ProbeProps
  back: ProbeProps
  holdChangeForever: () => void
  holdReturn: () => Deferred
}

function referenceJourney(): Journey {
  const holdable = holdableSource()
  const propsFor = (asset: AssetReference) => ({ asset, textureSource: holdable.source })
  return {
    first: propsFor(reference),
    change: propsFor(otherReference),
    back: propsFor(reference),
    holdChangeForever: () => holdable.hold(otherReference),
    holdReturn: () => holdable.hold(reference),
  }
}

function sourceJourney(): Journey {
  const original = holdableSource()
  const replacement = holdableSource()
  const propsFor = (holdable: ReturnType<typeof holdableSource>) => ({
    asset: reference,
    textureSource: holdable.source,
  })
  return {
    first: propsFor(original),
    change: propsFor(replacement),
    back: propsFor(original),
    holdChangeForever: () => replacement.hold(reference),
    holdReturn: () => original.hold(reference),
  }
}

describe('useGroundTexture under StrictMode', () => {
  let decoded: FakeBitmap[]

  beforeEach(() => {
    decoded = stubImageDecoding()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('still becomes ready, and no appearance handed out is freed while the view is mounted', async () => {
    const disposeTexture = vi.spyOn(Texture.prototype, 'dispose')
    const received: TextureState[] = []
    const Probe = recordingProbe(received)

    render(<Probe />, { reactStrictMode: true })

    await waitFor(() => expect(received.at(-1)?.status).toBe('ready'))
    const handedOut = handedOutTextures(received)
    const freed = disposeTexture.mock.contexts
    expect(received[0]?.status).toBe('loading')
    expect(handedOut.length).toBeGreaterThan(0)
    expect(handedOut.filter((texture) => freed.includes(texture))).toEqual([])
  })

  it('the ground texture is freed when the view unmounts', async () => {
    const disposeTexture = vi.spyOn(Texture.prototype, 'dispose')
    const received: TextureState[] = []
    const Probe = recordingProbe(received)
    const view = render(<Probe />, { reactStrictMode: true })
    await waitFor(() => expect(received.at(-1)?.status).toBe('ready'))
    const texture = received.at(-1)?.appearance?.texture
    expect(texture).toBeInstanceOf(Texture)
    const bitmap = decoded.find((candidate) => candidate === texture?.image)
    expect(bitmap).toBeDefined()
    const disposeCalls = () => disposeTexture.mock.contexts.filter((held) => held === texture)

    expect(disposeCalls()).toHaveLength(0)
    expect(bitmap?.close).not.toHaveBeenCalled()

    view.unmount()

    expect(disposeCalls()).toHaveLength(1)
    expect(bitmap?.close).toHaveBeenCalledTimes(1)
  })

  it('when the reference changes, the view shows loading and never the freed texture of the old reference', async () => {
    const holdable = holdableSource()
    const pending = holdable.hold(otherReference)
    const changingSource = holdable.source
    const received: TextureState[] = []
    const Probe = recordingProbe(received)
    const view = render(<Probe textureSource={changingSource} />, { reactStrictMode: true })
    await waitFor(() => expect(received.at(-1)?.status).toBe('ready'))
    const oldTexture = received.at(-1)?.appearance?.texture

    const renderedBefore = received.length
    view.rerender(<Probe asset={otherReference} textureSource={changingSource} />)

    const afterChange = received.slice(renderedBefore)
    expect(afterChange.length).toBeGreaterThan(0)
    expect(afterChange).toEqual(afterChange.map(() => LOADING))

    pending.settle(resolvedAsset(new Uint8Array([4, 5, 6]), otherReference.scope))
    await waitFor(() => expect(received.at(-1)?.status).toBe('ready'))
    const newTexture = received.at(-1)?.appearance?.texture
    expect(newTexture).toBeInstanceOf(Texture)
    expect(newTexture).not.toBe(oldTexture)
  })

  it.each([
    ['reference', referenceJourney],
    ['source', sourceJourney],
  ])(
    'returning to an earlier %s shows loading, never the texture its first load freed',
    async (_changed, journey) => {
      const disposeTexture = vi.spyOn(Texture.prototype, 'dispose')
      const { first, change, back, holdChangeForever, holdReturn } = journey()
      holdChangeForever()
      const received: TextureState[] = []
      const Probe = recordingProbe(received)
      const view = render(<Probe {...first} />, { reactStrictMode: true })
      await waitFor(() => expect(received.at(-1)?.status).toBe('ready'))
      const firstTexture = received.at(-1)?.appearance?.texture
      expect(firstTexture).toBeInstanceOf(Texture)

      const renderedBeforeChange = received.length
      view.rerender(<Probe {...change} />)

      const settleReturn = holdReturn()
      const renderedBeforeReturn = received.length
      view.rerender(<Probe {...back} />)
      const afterReturn = received.slice(renderedBeforeReturn)
      expect(afterReturn.length).toBeGreaterThan(0)
      expect(afterReturn).toEqual(afterReturn.map(() => LOADING))

      settleReturn.settle(resolvedAsset(new Uint8Array([7, 8, 9]), reference.scope))
      await waitFor(() => expect(received.at(-1)?.status).toBe('ready'))
      expect(received.at(-1)?.appearance?.texture).toBeInstanceOf(Texture)
      const freed = disposeTexture.mock.contexts
      const handedOut = handedOutTextures(received.slice(renderedBeforeChange))
      expect(handedOut.filter((texture) => freed.includes(texture))).toEqual([])
    },
  )
})

type RecordedState = { asset: AssetReference; state: TextureState }

/** Records each state with the reference it was rendered for, and reports each commit. */
function committingProbe(recorded: RecordedState[], onCommit: (asset: AssetReference) => void) {
  return function Probe({ asset, textureSource }: Required<ProbeProps>) {
    const state = useGroundTexture(asset, textureSource)
    recorded.push({ asset, state })
    useLayoutEffect(() => onCommit(asset), [asset])
    return null
  }
}

describe('useGroundTexture in a concurrent root without act', () => {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean | undefined }
  let wasActEnvironment: boolean | undefined
  let root: Root | undefined

  beforeEach(() => {
    stubImageDecoding()
    wasActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = false
  })

  afterEach(() => {
    root?.unmount()
    root = undefined
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = wasActEnvironment
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  // A non-urgent commit runs the old effect's cleanup in a later task, so the old load can settle
  // in between, while that effect run still counts as current.
  it('an old load that settles after a non-urgent commit of the new reference is never shown', async () => {
    const disposeTexture = vi.spyOn(Texture.prototype, 'dispose')
    const holdable = holdableSource()
    const oldLoad = holdable.hold(reference)
    const newLoad = holdable.hold(otherReference)
    const settleOldOnNewCommit = (asset: AssetReference) => {
      if (asset === otherReference) oldLoad.settle(resolvedAsset(new Uint8Array([1]), asset.scope))
    }
    const recorded: RecordedState[] = []
    const Probe = committingProbe(recorded, settleOldOnNewCommit)
    root = createRoot(document.createElement('div'))
    const mounted = root
    mounted.render(<Probe asset={reference} textureSource={holdable.source} />)
    await drainTasks()

    startTransition(() =>
      mounted.render(<Probe asset={otherReference} textureSource={holdable.source} />),
    )
    await drainTasks()
    const forNewReference = () => recorded.filter((entry) => entry.asset === otherReference)
    const beforeNewLoad = forNewReference().map((entry) => entry.state)
    expect(beforeNewLoad.length).toBeGreaterThan(0)
    expect(beforeNewLoad).toEqual(beforeNewLoad.map(() => LOADING))

    newLoad.settle(resolvedAsset(new Uint8Array([4, 5, 6]), otherReference.scope))
    await vi.waitFor(() => expect(recorded.at(-1)?.state.status).toBe('ready'))
    const freed = disposeTexture.mock.contexts
    const handedOut = handedOutTextures(forNewReference().map((entry) => entry.state))
    expect(handedOut.filter((texture) => freed.includes(texture))).toEqual([])
  })
})
