import { describe, expect, it } from 'vitest'
import { settle } from './fake-frame-host'
import { CLOCK_START_MS, installedProbe } from './frame-probe-test-setup'

// The page holds its frame callbacks from just before an edit until it has seen the scene commit,
// so that no browser frame draws the edit untimed. setHeld is that hold.

const FRAME_TIME_MS = 250

/** A held probe with three requested callbacks that record their names in `ran`. */
function heldWithThree() {
  const setup = installedProbe()
  const ran: string[] = []
  setup.probe.setHeld(true)
  for (const name of ['one', 'two', 'three']) setup.requestFrame(() => ran.push(name))
  return { ...setup, ran }
}

describe('holding the frame callbacks of the page', () => {
  it('runs no callback and records no sample in a host frame while held', () => {
    const { fake, probe, ran } = heldWithThree()

    fake.runFrame(FRAME_TIME_MS)

    expect(ran).toEqual([])
    expect(probe.takeFrames()).toEqual([])
  })

  it('keeps one request with the host after a held host frame, so that frames keep coming', () => {
    const { fake, ran } = heldWithThree()

    fake.runFrame(FRAME_TIME_MS)

    expect(fake.waitingFrameCount()).toBe(1)
    fake.runFrame(FRAME_TIME_MS)
    expect(ran).toEqual([])
    expect(fake.waitingFrameCount()).toBe(1)
  })

  it('runs the held callbacks on the next host frame after the release, in request order, with one sample', () => {
    const { fake, probe, ran } = heldWithThree()
    fake.runFrame(FRAME_TIME_MS)
    fake.advance(7)

    probe.setHeld(false)
    expect(ran).toEqual([])
    fake.runFrame(FRAME_TIME_MS)

    expect(ran).toEqual(['one', 'two', 'three'])
    expect(probe.takeFrames()).toMatchObject([{ startMs: CLOCK_START_MS + 7 }])
  })

  it('makes a callback that the page requests during the hold wait too, after the earlier ones', () => {
    const { fake, probe, requestFrame, ran } = heldWithThree()
    fake.runFrame(FRAME_TIME_MS)
    requestFrame(() => ran.push('during'))
    fake.runFrame(FRAME_TIME_MS)
    expect(ran).toEqual([])

    probe.setHeld(false)
    fake.runFrame(FRAME_TIME_MS)

    expect(ran).toEqual(['one', 'two', 'three', 'during'])
  })

  it('never runs a callback that is cancelled during the hold', () => {
    const { fake, probe, requestFrame, cancelFrame, ran } = heldWithThree()
    const cancelledId = requestFrame(() => ran.push('cancelled'))
    fake.runFrame(FRAME_TIME_MS)

    cancelFrame(cancelledId)
    probe.setHeld(false)
    fake.runFrame(FRAME_TIME_MS)
    fake.runFrame(FRAME_TIME_MS)

    expect(ran).toEqual(['one', 'two', 'three'])
  })

  it('changes nothing when it is released while nothing is held', () => {
    const { fake, probe, requestFrame } = installedProbe()
    const ran: string[] = []
    requestFrame(() => ran.push('first'))

    probe.setHeld(false)
    fake.runFrame(FRAME_TIME_MS)

    expect(ran).toEqual(['first'])
    expect(probe.takeFrames()).toHaveLength(1)
  })

  it('is the same when it is switched on twice and released once', () => {
    const { fake, probe, ran } = heldWithThree()
    probe.setHeld(true)
    fake.runFrame(FRAME_TIME_MS)
    expect(ran).toEqual([])

    probe.setHeld(false)
    fake.runFrame(FRAME_TIME_MS)

    expect(ran).toEqual(['one', 'two', 'three'])
  })
})

describe('holding the frame callbacks together with paced mode', () => {
  it('lets the paced rule keep holding after the release while GPU work is pending', async () => {
    const { fake, probe, requestFrame } = installedProbe()
    probe.setPaced(true)
    requestFrame(() => fake.queue.submit([]))
    fake.runFrame(FRAME_TIME_MS)
    const ran: string[] = []
    probe.setHeld(true)
    requestFrame(() => ran.push('waiting'))

    probe.setHeld(false)
    fake.runFrame(FRAME_TIME_MS)
    expect(ran).toEqual([])

    fake.finishGpuWork()
    await settle()
    fake.runFrame(FRAME_TIME_MS)
    expect(ran).toEqual(['waiting'])
  })

  it('lets the manual hold keep holding after the GPU work is done in paced mode', async () => {
    const { fake, probe, requestFrame } = installedProbe()
    probe.setPaced(true)
    requestFrame(() => fake.queue.submit([]))
    fake.runFrame(FRAME_TIME_MS)
    const ran: string[] = []
    probe.setHeld(true)
    requestFrame(() => ran.push('waiting'))
    fake.finishGpuWork()
    await settle()

    fake.runFrame(FRAME_TIME_MS)
    expect(ran).toEqual([])

    probe.setHeld(false)
    fake.runFrame(FRAME_TIME_MS)
    expect(ran).toEqual(['waiting'])
  })
})

describe('uninstalling the probe during a hold', () => {
  it('ends the hold and hands every held callback to the original request function, in order', () => {
    const { fake, probe, ran } = heldWithThree()
    fake.runFrame(FRAME_TIME_MS)

    probe.uninstall()
    fake.runFrame(FRAME_TIME_MS)

    expect(ran).toEqual(['one', 'two', 'three'])
  })
})
