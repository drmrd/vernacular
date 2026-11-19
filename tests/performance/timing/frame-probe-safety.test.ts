import { describe, expect, it } from 'vitest'
import { SUBMIT_RESULT, createFakeFrameHost, settle } from './fake-frame-host'
import { installFrameProbe } from './frame-probe'

const CLOCK_START_MS = 100

function installed() {
  const fake = createFakeFrameHost(CLOCK_START_MS)
  const probe = installFrameProbe(fake.host, fake.target)
  const requestFrame = (callback: FrameRequestCallback) =>
    fake.target.requestAnimationFrame(callback)
  const cancelFrame = (id: number) => fake.target.cancelAnimationFrame(id)
  return { fake, probe, requestFrame, cancelFrame }
}

/** Paced probe with a first callback that submits and then requests `next` for the next frame. */
function pacedAfterSubmit(next: FrameRequestCallback) {
  const setup = installed()
  setup.probe.setPaced(true)
  let nextId = -1
  setup.requestFrame(() => {
    setup.fake.queue.submit([])
    nextId = setup.requestFrame(next)
  })
  return { ...setup, nextId: () => nextId }
}

describe('cancelling a frame callback', () => {
  it('stops a callback from running when not paced', () => {
    const { fake, requestFrame, cancelFrame } = installed()
    const ran: string[] = []
    const first = requestFrame(() => ran.push('first'))
    requestFrame(() => ran.push('second'))

    cancelFrame(first)
    fake.runFrame()

    expect(ran).toEqual(['second'])
  })

  it('stops a callback that an earlier callback of the same host frame cancels', () => {
    const { fake, requestFrame, cancelFrame } = installed()
    const ran: string[] = []
    let second = -1
    requestFrame(() => {
      ran.push('first')
      cancelFrame(second)
    })
    second = requestFrame(() => ran.push('second'))

    fake.runFrame()

    expect(ran).toEqual(['first'])
  })

  it('stops a held callback, and the probe stops asking the host for frames for it, when paced', async () => {
    const ran: string[] = []
    const { fake, cancelFrame, nextId } = pacedAfterSubmit(() => ran.push('held'))
    fake.runFrame()
    fake.runFrame()
    expect(fake.waitingFrameIds()).toHaveLength(1)

    cancelFrame(nextId())
    expect(fake.waitingFrameIds()).toEqual([])

    fake.finishGpuWork()
    await settle()
    fake.runFrame()
    fake.runFrame()

    expect(ran).toEqual([])
    expect(fake.waitingFrameIds()).toEqual([])
  })

  it('does nothing and does not throw for an id that was never handed out', () => {
    const { fake, requestFrame, cancelFrame } = installed()
    const ran: string[] = []
    requestFrame(() => ran.push('waiting'))

    expect(() => {
      cancelFrame(9999)
      cancelFrame(0)
      cancelFrame(-1)
    }).not.toThrow()
    fake.runFrame()

    expect(ran).toEqual(['waiting'])
  })

  it('does nothing and does not throw for a callback that already ran', () => {
    const { fake, requestFrame, cancelFrame } = installed()
    const ran: string[] = []
    const first = requestFrame(() => ran.push('first'))
    fake.runFrame()
    requestFrame(() => ran.push('second'))

    expect(() => cancelFrame(first)).not.toThrow()
    fake.runFrame()

    expect(ran).toEqual(['first', 'second'])
  })
})

describe('the ids of frame requests', () => {
  it('are unique for callbacks that wait at the same time', () => {
    const { requestFrame } = installed()

    const ids = [requestFrame(() => undefined), requestFrame(() => undefined)]
    ids.push(requestFrame(() => undefined))

    expect(new Set(ids).size).toBe(3)
  })

  it('stay unique while the probe holds a callback and the page requests another', async () => {
    const ran: string[] = []
    const { fake, requestFrame, cancelFrame, nextId } = pacedAfterSubmit(() => ran.push('held'))
    fake.runFrame()
    fake.runFrame()

    const other = requestFrame(() => ran.push('other'))
    expect(other).not.toBe(nextId())
    cancelFrame(other)
    fake.finishGpuWork()
    await settle()
    fake.runFrame()

    expect(ran).toEqual(['held'])
  })
})

describe('paced mode with several callbacks', () => {
  it('holds every other callback of the frame, also one requested before the submit', async () => {
    const { fake, probe, requestFrame } = installed()
    probe.setPaced(true)
    const ran: string[] = []
    requestFrame(() => {
      ran.push('submitter')
      fake.queue.submit([])
    })
    requestFrame(() => ran.push('same frame'))

    fake.runFrame()
    fake.runFrame()
    expect(ran).toEqual(['submitter'])

    fake.finishGpuWork()
    await settle()
    expect(ran).toEqual(['submitter'])

    fake.runFrame()
    expect(ran).toEqual(['submitter', 'same frame'])
  })

  it('runs the held callbacks in the order in which the page requested them', async () => {
    const { fake, probe, requestFrame } = installed()
    probe.setPaced(true)
    const ran: string[] = []
    requestFrame(() => {
      fake.queue.submit([])
      requestFrame(() => ran.push('requested during the frame'))
    })
    requestFrame(() => ran.push('requested before, one'))
    requestFrame(() => ran.push('requested before, two'))

    fake.runFrame()
    fake.finishGpuWork()
    await settle()
    fake.runFrame()

    expect(ran).toEqual([
      'requested before, one',
      'requested before, two',
      'requested during the frame',
    ])
  })
})

describe('a frame callback that submits more than once', () => {
  it('completes its sample when the done promise of the last submit resolves', async () => {
    const { fake, probe, requestFrame } = installed()
    requestFrame(() => {
      fake.advance(2)
      fake.queue.submit([])
      fake.queue.submit([])
    })
    fake.runFrame()

    fake.advance(3)
    fake.finishGpuWork()
    await settle()
    expect(probe.takeFrames()).toEqual([])

    fake.advance(4)
    fake.finishGpuWork()
    await settle()
    expect(probe.takeFrames()).toMatchObject([{ mainThreadMs: 2, untilGpuDoneMs: 9 }])
  })
})

describe('a submit outside a frame callback', () => {
  it('is passed through and creates no sample', async () => {
    const { fake, probe } = installed()
    const commandBuffers = ['outside']

    const returned = fake.queue.submit(commandBuffers)
    fake.finishGpuWork()
    await settle()

    expect(returned).toBe(SUBMIT_RESULT)
    expect(fake.submitCalls).toEqual([{ receiver: fake.queue, args: [commandBuffers] }])
    expect(probe.takeFrames()).toEqual([])
  })

  it('does not change the sample of a frame that ran before it', async () => {
    const { fake, probe, requestFrame } = installed()
    requestFrame(() => undefined)
    fake.runFrame()

    fake.queue.submit([])
    fake.finishGpuWork()
    await settle()

    expect(probe.takeFrames()).toMatchObject([{ untilGpuDoneMs: null, gpuLost: false }])
  })
})

describe('a lost device', () => {
  it('completes the sample with no GPU time and a lost mark when the done promise rejects', async () => {
    const { fake, probe, requestFrame } = installed()
    requestFrame(() => fake.queue.submit([]))
    fake.runFrame()

    fake.failGpuWork()
    await settle()

    expect(probe.takeFrames()).toMatchObject([{ untilGpuDoneMs: null, gpuLost: true }])
  })

  it('does not hold the next callback for ever when paced', async () => {
    const ran: string[] = []
    const { fake } = pacedAfterSubmit(() => ran.push('next'))
    fake.runFrame()
    fake.runFrame()
    expect(ran).toEqual([])

    fake.failGpuWork()
    await settle()
    fake.runFrame()

    expect(ran).toEqual(['next'])
  })

  it('does not mark a frame whose done promise resolves or a frame with no submit', async () => {
    const { fake, probe, requestFrame } = installed()
    requestFrame(() => fake.queue.submit([]))
    fake.runFrame()
    fake.finishGpuWork()
    await settle()
    requestFrame(() => undefined)
    fake.runFrame()

    expect(probe.takeFrames().map((frame) => frame.gpuLost)).toEqual([false, false])
  })
})

describe('uninstalling while paced mode holds a callback', () => {
  it('restores both originals and the submit by identity', () => {
    const { fake, probe } = pacedAfterSubmit(() => undefined)
    fake.runFrame()
    fake.runFrame()

    probe.uninstall()

    expect(fake.target.requestAnimationFrame).toBe(fake.originalRequestFrame)
    expect(fake.target.cancelAnimationFrame).toBe(fake.originalCancelFrame)
    expect(fake.queuePrototype.submit).toBe(fake.originalSubmit)
  })

  it('still runs the held callback on the next host frame when the GPU work is not done', () => {
    const ran: string[] = []
    const { fake, probe } = pacedAfterSubmit(() => ran.push('held'))
    fake.runFrame()
    fake.runFrame()

    probe.uninstall()
    fake.runFrame()

    expect(ran).toEqual(['held'])
  })

  it('still runs the held callback on the next host frame when the GPU work is done', async () => {
    const ran: string[] = []
    const { fake, probe } = pacedAfterSubmit(() => ran.push('held'))
    fake.runFrame()
    fake.runFrame()
    fake.finishGpuWork()
    await settle()

    probe.uninstall()
    fake.runFrame()

    expect(ran).toEqual(['held'])
  })
})
