import { describe, expect, it } from 'vitest'
import { settle } from './fake-frame-host'
import { installedProbe, type InstalledProbe } from './frame-probe-test-setup'

const LOOP_FRAMES = 10

/** Paced probe holding the callbacks that a first, submitting callback requested for the next frame. */
function pacedWithHeld(heldCallbacks: FrameRequestCallback[]) {
  const setup = installedProbe()
  setup.probe.setPaced(true)
  setup.requestFrame(() => {
    setup.fake.queue.submit([])
    for (const callback of heldCallbacks) setup.requestFrame(callback)
  })
  setup.fake.runFrame()
  setup.fake.runFrame()
  return setup
}

/**
 * Paces the probe, requests a callback, and checks that it stays held until the GPU work of the
 * two submits that are still open is done, one after the other.
 */
async function expectNextHeldUntilTwoGpuWorksDone(setup: InstalledProbe) {
  const { fake, probe, requestFrame } = setup
  probe.setPaced(true)
  const ran: string[] = []
  requestFrame(() => ran.push('next'))

  fake.runFrame()
  expect(ran).toEqual([])

  fake.finishGpuWork()
  await settle()
  fake.runFrame()
  expect(ran).toEqual([])

  fake.finishGpuWork()
  await settle()
  fake.runFrame()
  expect(ran).toEqual(['next'])
}

describe('a frame with GPU work of several earlier frames pending', () => {
  it('holds the next callback until the GPU work of both earlier frames is done', async () => {
    const setup = installedProbe()
    const { fake, requestFrame } = setup
    requestFrame(() => fake.queue.submit([]))
    fake.runFrame()
    requestFrame(() => fake.queue.submit([]))
    fake.runFrame()
    await expectNextHeldUntilTwoGpuWorksDone(setup)
  })

  it('holds the next callback until the GPU work of both submits of one host frame is done', async () => {
    const setup = installedProbe()
    const { fake, requestFrame } = setup
    requestFrame(() => fake.queue.submit([]))
    requestFrame(() => fake.queue.submit([]))
    fake.runFrame()
    await expectNextHeldUntilTwoGpuWorksDone(setup)
  })
})

describe('a frame callback that throws', () => {
  it('lets the other callbacks of the host frame run, reaches the host, and keeps one sample for the frame', () => {
    const { fake, probe, requestFrame } = installedProbe()
    const ran: string[] = []
    requestFrame(() => ran.push('first'))
    requestFrame(() => {
      ran.push('thrower')
      throw new Error('page error')
    })
    requestFrame(() => ran.push('third'))

    expect(() => fake.runFrame()).toThrow('page error')

    expect(ran).toEqual(['first', 'thrower', 'third'])
    expect(probe.takeFrames()).toHaveLength(1)
  })

  it('leaves the next host frame serving a callback that is requested afterwards', () => {
    const { fake, requestFrame } = installedProbe()
    requestFrame(() => {
      throw new Error('page error')
    })
    expect(() => fake.runFrame()).toThrow('page error')
    const ran: string[] = []

    requestFrame(() => ran.push('after'))
    fake.runFrame()

    expect(ran).toEqual(['after'])
  })
})

describe('cancelling from inside a callback', () => {
  it('does not throw when a callback cancels its own id, and the other callbacks still run', () => {
    const { fake, requestFrame, cancelFrame } = installedProbe()
    const ran: string[] = []
    let ownId = -1
    ownId = requestFrame(() => {
      ran.push('self')
      cancelFrame(ownId)
    })
    requestFrame(() => ran.push('other'))

    expect(() => fake.runFrame()).not.toThrow()

    expect(ran).toEqual(['self', 'other'])
  })
})

describe('leaving paced mode while callbacks are held', () => {
  it('runs them on the next host frame and not at once', () => {
    const ran: string[] = []
    const { fake, probe } = pacedWithHeld([() => ran.push('one'), () => ran.push('two')])
    expect(ran).toEqual([])

    probe.setPaced(false)
    expect(ran).toEqual([])

    fake.runFrame()
    expect(ran).toEqual(['one', 'two'])
  })
})

describe('the host frame requests of the probe', () => {
  it('asks the host for a frame when a callback is requested after the queue was empty', () => {
    const { fake, requestFrame } = installedProbe()
    const ran: string[] = []
    requestFrame(() => ran.push('first'))
    fake.runFrame()
    expect(fake.waitingFrameCount()).toBe(0)

    requestFrame(() => ran.push('later'))
    expect(fake.waitingFrameCount()).toBe(1)
    fake.runFrame()

    expect(ran).toEqual(['first', 'later'])
  })

  it('cancels the host request when a cancel empties the queue, and asks again for a later request', () => {
    const { fake, requestFrame, cancelFrame } = installedProbe()
    const ran: string[] = []
    const id = requestFrame(() => ran.push('cancelled'))
    expect(fake.waitingFrameCount()).toBe(1)

    cancelFrame(id)
    expect(fake.waitingFrameCount()).toBe(0)

    requestFrame(() => ran.push('later'))
    expect(fake.waitingFrameCount()).toBe(1)
    fake.runFrame()

    expect(ran).toEqual(['later'])
  })
})

describe('a callback that requests itself every frame', () => {
  it('runs once in each of ten host frames when not paced', () => {
    const { fake, requestFrame } = installedProbe()
    let runs = 0
    const loop = () => {
      runs += 1
      requestFrame(loop)
    }
    requestFrame(loop)

    const runsAfterEachFrame: number[] = []
    for (let frame = 0; frame < LOOP_FRAMES; frame += 1) {
      fake.runFrame()
      runsAfterEachFrame.push(runs)
    }

    expect(runsAfterEachFrame).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('runs once in each host frame that follows a resolved GPU work when paced', async () => {
    const { fake, probe, requestFrame } = installedProbe()
    probe.setPaced(true)
    let runs = 0
    const loop = () => {
      runs += 1
      fake.queue.submit([])
      requestFrame(loop)
    }
    requestFrame(loop)

    const runsAfterEachFrame: number[] = []
    for (let frame = 0; frame < LOOP_FRAMES; frame += 1) {
      fake.runFrame()
      runsAfterEachFrame.push(runs)
      fake.finishGpuWork()
      await settle()
    }

    expect(runsAfterEachFrame).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })
})

describe('uninstalling while three callbacks are held', () => {
  it('runs each of them exactly once on the next host frame, in order', () => {
    const ran: string[] = []
    const { fake, probe } = pacedWithHeld([
      () => ran.push('one'),
      () => ran.push('two'),
      () => ran.push('three'),
    ])
    expect(ran).toEqual([])

    probe.uninstall()
    fake.runFrame()
    fake.runFrame()

    expect(ran).toEqual(['one', 'two', 'three'])
  })
})
