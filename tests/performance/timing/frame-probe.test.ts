import { describe, expect, it } from 'vitest'
import { SUBMIT_RESULT, createFakeFrameHost, settle } from './fake-frame-host'
import { firstFrameAfter, installFrameProbe, type FrameSample } from './frame-probe'

const CLOCK_START_MS = 100

function installed() {
  const fake = createFakeFrameHost(CLOCK_START_MS)
  const probe = installFrameProbe(fake.host, fake.target)
  const requestFrame = (callback: FrameRequestCallback) =>
    fake.target.requestAnimationFrame(callback)
  return { fake, probe, requestFrame }
}

describe('the frame probe', () => {
  it('times the main thread of a frame callback from the clock at its start', () => {
    const { fake, probe, requestFrame } = installed()
    requestFrame(() => fake.advance(3))

    fake.runFrame()

    expect(probe.takeFrames()).toMatchObject([{ startMs: CLOCK_START_MS, mainThreadMs: 3 }])
  })

  it('reports the time until the GPU is done once the done promise resolves', async () => {
    const { fake, probe, requestFrame } = installed()
    requestFrame(() => {
      fake.advance(2)
      fake.queue.submit([])
    })
    fake.runFrame()

    expect(probe.takeFrames()).toEqual([])

    fake.advance(5)
    fake.finishGpuWork()
    await settle()

    expect(probe.takeFrames()).toMatchObject([{ mainThreadMs: 2, untilGpuDoneMs: 7 }])
  })

  it('reports no GPU time for a frame callback that submitted nothing', () => {
    const { fake, probe, requestFrame } = installed()
    requestFrame(() => fake.advance(1))

    fake.runFrame()

    expect(probe.takeFrames()).toMatchObject([{ untilGpuDoneMs: null }])
  })

  it('marks a frame that ran while the page was hidden and not one that ran visible', () => {
    const { fake, probe, requestFrame } = installed()
    requestFrame(() => undefined)
    fake.setHidden(true)
    fake.runFrame()
    requestFrame(() => undefined)
    fake.setHidden(false)
    fake.runFrame()

    expect(probe.takeFrames().map((frame) => frame.hidden)).toEqual([true, false])
  })

  it('returns the samples once and starts a new list after taking them', () => {
    const { fake, probe, requestFrame } = installed()
    requestFrame(() => undefined)
    fake.runFrame()

    expect(probe.takeFrames()).toHaveLength(1)
    expect(probe.takeFrames()).toEqual([])
  })

  it('holds the next frame callback until the GPU work of the previous frame is done when paced', async () => {
    const { fake, probe, requestFrame } = installed()
    probe.setPaced(true)
    const ran: string[] = []
    requestFrame(() => {
      ran.push('first')
      fake.queue.submit([])
      requestFrame(() => ran.push('second'))
    })

    fake.runFrame()
    fake.runFrame()
    expect(ran).toEqual(['first'])

    fake.finishGpuWork()
    await settle()
    expect(ran).toEqual(['first'])

    fake.runFrame()
    expect(ran).toEqual(['first', 'second'])
  })

  it('runs the next frame callback on the next frame when not paced, done or not', () => {
    const { fake, probe, requestFrame } = installed()
    probe.setPaced(false)
    const ran: string[] = []
    requestFrame(() => {
      ran.push('first')
      fake.queue.submit([])
      requestFrame(() => ran.push('second'))
    })

    fake.runFrame()
    fake.runFrame()

    expect(ran).toEqual(['first', 'second'])
  })

  it('still calls the original submit with the same arguments and returns its result', () => {
    const { fake, requestFrame } = installed()
    const commandBuffers = ['pass-1', 'pass-2']
    let returned: string | undefined
    requestFrame(() => {
      returned = fake.queue.submit(commandBuffers)
    })

    fake.runFrame()

    expect(returned).toBe(SUBMIT_RESULT)
    expect(fake.submitCalls).toEqual([{ receiver: fake.queue, args: [commandBuffers] }])
  })

  it('hands the frame time of the host to the frame callbacks of the page', () => {
    const { fake, requestFrame } = installed()
    const received: number[] = []
    requestFrame((frameTimeMs) => received.push(frameTimeMs))

    fake.runFrame(16.7)

    expect(received).toEqual([16.7])
  })

  it('restores the original frame request and the original submit on uninstall', () => {
    const { fake, probe } = installed()
    expect(fake.target.requestAnimationFrame).not.toBe(fake.originalRequestFrame)
    expect(fake.queuePrototype.submit).not.toBe(fake.originalSubmit)

    probe.uninstall()

    expect(fake.target.requestAnimationFrame).toBe(fake.originalRequestFrame)
    expect(fake.queuePrototype.submit).toBe(fake.originalSubmit)
  })
})

describe('the first frame after a time', () => {
  const sample = (startMs: number): FrameSample => ({
    startMs,
    mainThreadMs: 1,
    untilGpuDoneMs: null,
    hidden: false,
  })
  const frames = [sample(10), sample(20), sample(30)]

  it('is the first sample that started at or after the time', () => {
    expect(firstFrameAfter(frames, 20)).toBe(frames[1])
    expect(firstFrameAfter(frames, 21)).toBe(frames[2])
    expect(firstFrameAfter(frames, 0)).toBe(frames[0])
  })

  it('is undefined when every sample started earlier', () => {
    expect(firstFrameAfter(frames, 31)).toBeUndefined()
    expect(firstFrameAfter([], 0)).toBeUndefined()
  })
})
