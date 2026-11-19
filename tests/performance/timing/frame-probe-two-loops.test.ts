import { describe, expect, it } from 'vitest'
import { createFakeFrameHost, settle } from './fake-frame-host'
import { installFrameProbe, type FrameSample } from './frame-probe'

const UNPACED_FRAMES = 3
const SAMPLES_WANTED = 5
const FRAME_BOUND = 20
const FRAME_INTERVAL_MS = 10
const MIN_LOOP_RUNS = 4

type Order = 'render loop first' | 'animation loop first'
type GpuTiming = 'one host frame late' | 'before the next host frame'

/**
 * A page with two callback loops, each requesting its next frame from inside its own callback:
 * the render loop submits in each callback, the animation loop never submits.
 */
function twoLoopPage(order: Order) {
  const fake = createFakeFrameHost()
  const probe = installFrameProbe(fake.host, fake.target)
  const request = (callback: FrameRequestCallback) => fake.target.requestAnimationFrame(callback)
  const runs = { render: 0, animation: 0, finishedWork: 0 }
  const render = () => {
    runs.render += 1
    fake.queue.submit([])
    request(render)
  }
  const animation = () => {
    runs.animation += 1
    request(animation)
  }
  const loops = order === 'render loop first' ? [render, animation] : [animation, render]
  for (const loop of loops) request(loop)
  return { fake, probe, runs }
}

/** Runs one host frame, then resolves the GPU work that the timing says is due. */
async function runHostFrame(page: ReturnType<typeof twoLoopPage>, timing: GpuTiming) {
  const { fake } = page
  const submitsBefore = fake.submitCalls.length
  fake.advance(FRAME_INTERVAL_MS)
  fake.runFrame()
  const resolveUpTo =
    timing === 'before the next host frame' ? fake.submitCalls.length : submitsBefore
  while (page.runs.finishedWork < resolveUpTo) {
    fake.finishGpuWork()
    page.runs.finishedWork += 1
  }
  await settle()
}

async function steadyPacedRun(order: Order, timing: GpuTiming) {
  const page = twoLoopPage(order)
  for (let frame = 0; frame < UNPACED_FRAMES; frame += 1) await runHostFrame(page, timing)
  page.probe.takeFrames()
  page.probe.setPaced(true)
  const switchMs = page.fake.host.now()
  const rendersAtSwitch = page.runs.render
  const animationsAtSwitch = page.runs.animation
  const samples: FrameSample[] = []
  let hostFrames = 0
  while (samples.length < SAMPLES_WANTED && hostFrames < FRAME_BOUND) {
    await runHostFrame(page, timing)
    hostFrames += 1
    samples.push(...page.probe.takeFrames().filter((sample) => sample.startMs > switchMs))
  }
  return {
    samples,
    hostFrames,
    renderRuns: page.runs.render - rendersAtSwitch,
    animationRuns: page.runs.animation - animationsAtSwitch,
  }
}

const orders: Order[] = ['render loop first', 'animation loop first']
const timings: GpuTiming[] = ['one host frame late', 'before the next host frame']

describe.each(orders.flatMap((order) => timings.map((timing) => ({ order, timing }))))(
  'a steady paced run with $order and GPU work done $timing',
  ({ order, timing }) => {
    it('gives every sample after the switch a GPU time and no lost device', async () => {
      const { samples } = await steadyPacedRun(order, timing)

      expect(samples.map((sample) => typeof sample.untilGpuDoneMs)).toEqual(
        samples.map(() => 'number'),
      )
      expect(samples.map((sample) => sample.gpuLost)).toEqual(samples.map(() => false))
    })

    it('submits exactly once for each sample after the switch', async () => {
      const { samples, renderRuns } = await steadyPacedRun(order, timing)

      expect(renderRuns).toBe(samples.length)
    })

    it('does not stall: five samples arrive within twenty host frames', async () => {
      const { samples, hostFrames } = await steadyPacedRun(order, timing)

      expect(samples).toHaveLength(SAMPLES_WANTED)
      expect(hostFrames).toBeLessThan(FRAME_BOUND + 1)
    })

    it('keeps both loops alive: each runs at least four times after the switch', async () => {
      const { renderRuns, animationRuns } = await steadyPacedRun(order, timing)

      expect(renderRuns).toBeGreaterThanOrEqual(MIN_LOOP_RUNS)
      expect(animationRuns).toBeGreaterThanOrEqual(MIN_LOOP_RUNS)
    })
  },
)

describe('a steady paced run with the render loop first and GPU work done one host frame late', () => {
  it('makes no sample in the host frames in which every callback is held', async () => {
    const { samples, hostFrames } = await steadyPacedRun('render loop first', 'one host frame late')

    expect(samples.length).toBeLessThan(hostFrames)
  })
})
