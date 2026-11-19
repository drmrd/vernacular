import { describe, expect, it } from 'vitest'
import { settle } from './fake-frame-host'
import {
  CLOCK_START_MS,
  expectSampleOnceBothGpuWorksAreDone,
  installedProbe,
  requestSubmitAfter,
} from './frame-probe-test-setup'

describe('a host frame with two page callbacks, one of which submits', () => {
  it('makes one sample, timed over both callbacks, when the first one submits', async () => {
    const { fake, probe, requestFrame } = installedProbe()
    requestFrame(() => {
      fake.advance(3)
      fake.queue.submit([])
    })
    requestFrame(() => fake.advance(2))
    fake.runFrame()

    expect(probe.takeFrames()).toEqual([])

    fake.advance(4)
    fake.finishGpuWork()
    await settle()

    expect(probe.takeFrames()).toEqual([
      {
        startMs: CLOCK_START_MS,
        mainThreadMs: 5,
        untilGpuDoneMs: 9,
        hidden: false,
        gpuLost: false,
      },
    ])
  })

  it('makes one sample, timed over both callbacks, when the second one submits', async () => {
    const { fake, probe, requestFrame } = installedProbe()
    requestFrame(() => fake.advance(2))
    requestFrame(() => {
      fake.advance(3)
      fake.queue.submit([])
    })
    fake.runFrame()

    expect(probe.takeFrames()).toEqual([])

    fake.advance(1)
    fake.finishGpuWork()
    await settle()

    expect(probe.takeFrames()).toEqual([
      {
        startMs: CLOCK_START_MS,
        mainThreadMs: 5,
        untilGpuDoneMs: 6,
        hidden: false,
        gpuLost: false,
      },
    ])
  })

  it('completes the sample when the done promise of the later of two submits settles', async () => {
    const setup = installedProbe()
    requestSubmitAfter(setup, 1)
    requestSubmitAfter(setup, 1)

    await expectSampleOnceBothGpuWorksAreDone(setup)
  })
})

describe('a host frame with two page callbacks that submit nothing', () => {
  it('makes one sample with no GPU time at once', () => {
    const { fake, probe, requestFrame } = installedProbe()
    requestFrame(() => fake.advance(1))
    requestFrame(() => fake.advance(2))

    fake.runFrame()

    expect(probe.takeFrames()).toEqual([
      {
        startMs: CLOCK_START_MS,
        mainThreadMs: 3,
        untilGpuDoneMs: null,
        hidden: false,
        gpuLost: false,
      },
    ])
  })
})

describe('the main-thread time of a host frame', () => {
  it('runs from the start of the first callback to the end of the last, with what lies between', () => {
    const { fake, probe, requestFrame } = installedProbe()
    requestFrame(() => fake.advance(3))
    requestFrame(() => fake.advance(2))

    fake.runFrame(0, () => fake.advance(4))

    const [sample, ...others] = probe.takeFrames()
    expect(others).toEqual([])
    expect(sample?.mainThreadMs).toBe(fake.host.now() - CLOCK_START_MS)
  })
})

describe('several host frames with two page callbacks each', () => {
  it('make one sample for each host frame', () => {
    const { fake, probe, requestFrame } = installedProbe()
    requestFrame(() => fake.advance(1))
    requestFrame(() => fake.advance(2))
    fake.runFrame()
    fake.advance(10)
    requestFrame(() => fake.advance(4))
    requestFrame(() => fake.advance(5))
    fake.runFrame()

    expect(probe.takeFrames()).toMatchObject([
      { startMs: CLOCK_START_MS, mainThreadMs: 3 },
      { startMs: CLOCK_START_MS + 13, mainThreadMs: 9 },
    ])
  })
})

describe('a host frame in which paced mode holds every callback', () => {
  it('makes no sample, and the next frame after the work is done makes one', async () => {
    const { fake, probe, requestFrame } = installedProbe()
    probe.setPaced(true)
    requestFrame(() => {
      fake.queue.submit([])
      requestFrame(() => fake.advance(1))
      requestFrame(() => fake.advance(2))
    })
    fake.runFrame()
    fake.advance(10)
    fake.runFrame()

    fake.finishGpuWork()
    await settle()
    expect(probe.takeFrames()).toHaveLength(1)

    fake.advance(10)
    const startOfNextFrameMs = fake.host.now()
    fake.runFrame()

    expect(probe.takeFrames()).toMatchObject([
      { startMs: startOfNextFrameMs, mainThreadMs: 3, untilGpuDoneMs: null },
    ])
  })
})

describe('the hidden mark of a host frame', () => {
  it('comes from the start of the first callback when the page is hidden then', () => {
    const { fake, probe, requestFrame } = installedProbe()
    fake.setHidden(true)
    requestFrame(() => fake.setHidden(false))
    requestFrame(() => undefined)

    fake.runFrame()

    expect(probe.takeFrames().map((frame) => frame.hidden)).toEqual([true])
  })

  it('is false when the page is visible then, although it is hidden before the frame ends', () => {
    const { fake, probe, requestFrame } = installedProbe()
    requestFrame(() => undefined)
    requestFrame(() => fake.setHidden(true))

    fake.runFrame()

    expect(probe.takeFrames().map((frame) => frame.hidden)).toEqual([false])
  })
})

describe('a host frame whose first callback throws', () => {
  it('still makes one complete sample, and the error reaches the host', () => {
    const { fake, probe, requestFrame } = installedProbe()
    const ran: string[] = []
    requestFrame(() => {
      ran.push('thrower')
      fake.advance(2)
      throw new Error('page error')
    })
    requestFrame(() => {
      ran.push('second')
      fake.advance(3)
    })

    expect(() => fake.runFrame()).toThrow('page error')

    expect(ran).toEqual(['thrower', 'second'])
    expect(probe.takeFrames()).toEqual([
      {
        startMs: CLOCK_START_MS,
        mainThreadMs: 5,
        untilGpuDoneMs: null,
        hidden: false,
        gpuLost: false,
      },
    ])
  })
})
