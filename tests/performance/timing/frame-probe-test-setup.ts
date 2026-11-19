import { expect } from 'vitest'
import { createFakeFrameHost, settle } from './fake-frame-host'
import { installFrameProbe } from './frame-probe'

/** The time of the fake clock when a frame probe test starts, in milliseconds. */
export const CLOCK_START_MS = 100

/** A fake host with a frame probe installed on it, and the page-side request and cancel calls. */
export function installedProbe() {
  const fake = createFakeFrameHost(CLOCK_START_MS)
  const probe = installFrameProbe(fake.host, fake.target)
  const requestFrame = (callback: FrameRequestCallback) =>
    fake.target.requestAnimationFrame(callback)
  const cancelFrame = (id: number) => fake.target.cancelAnimationFrame(id)
  return { fake, probe, requestFrame, cancelFrame }
}

const FIRST_WORK_WAIT_MS = 3
const SECOND_WORK_WAIT_MS = 4

/** The result of `installedProbe`. */
export type InstalledProbe = ReturnType<typeof installedProbe>

/** Requests a frame callback that spends the given time and then submits GPU work. */
export function requestSubmitAfter(setup: InstalledProbe, spentMs: number): number {
  return setup.requestFrame(() => {
    setup.fake.advance(spentMs)
    setup.fake.queue.submit([])
  })
}

/** Moves the clock by the given time, then finishes the oldest open GPU work and lets it settle. */
export async function finishGpuWorkAfter(setup: InstalledProbe, elapsedMs: number): Promise<void> {
  setup.fake.advance(elapsedMs)
  setup.fake.finishGpuWork()
  await settle()
}

/** Requests a callback that records 'first', submits GPU work, and requests one that records 'second'. */
export function requestFirstThenSecond(setup: InstalledProbe, ran: string[]): void {
  setup.requestFrame(() => {
    ran.push('first')
    setup.fake.queue.submit([])
    setup.requestFrame(() => ran.push('second'))
  })
}

/**
 * Runs the host frame, then checks that the sample of two submits (2 ms of main thread, 9 ms until
 * the GPU is done) appears only when the done promise of the second one has settled.
 */
export async function expectSampleOnceBothGpuWorksAreDone(setup: InstalledProbe): Promise<void> {
  setup.fake.runFrame()

  await finishGpuWorkAfter(setup, FIRST_WORK_WAIT_MS)
  expect(setup.probe.takeFrames()).toEqual([])

  await finishGpuWorkAfter(setup, SECOND_WORK_WAIT_MS)
  expect(setup.probe.takeFrames()).toMatchObject([{ mainThreadMs: 2, untilGpuDoneMs: 9 }])
}
