import { describe, expect, it } from 'vitest'
import { baselineWriteRefusals, isSoftwareRenderer, runRefusals } from './run-conditions'
import type { ObservedConditions } from './run-conditions'
import { aTimingRun } from './timing-run-fixture'

/** Conditions that allow a measurement: a production build, a hardware adapter, a visible window. */
function goodConditions(): ObservedConditions {
  return {
    productionBuild: true,
    webGpuAdapter: { name: 'apple / metal-3 / Apple M5 Pro', isFallback: false },
    visible: true,
    displayFrameMs: 8.33,
  }
}

describe('recognizing a software renderer by its name', () => {
  it.each([
    'Google SwiftShader',
    'llvmpipe (LLVM 15.0.7, 256 bits)',
    'Microsoft Basic Render Driver',
    'Software Adapter',
  ])('takes "%s" for a software renderer', (name) => {
    expect(isSoftwareRenderer(name)).toBe(true)
  })

  it.each(['GOOGLE SWIFTSHADER', 'LLVMPIPE (llvm 15.0.7, 256 bits)', 'software adapter'])(
    'takes "%s" for a software renderer whatever its letter case',
    (name) => {
      expect(isSoftwareRenderer(name)).toBe(true)
    },
  )

  it.each([
    'ANGLE Metal Renderer: Apple M2',
    'apple / metal-3',
    'Apple M5 Pro',
    'NVIDIA GeForce RTX 4070',
    'ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Pro, Unspecified Version)',
  ])('takes "%s" for a hardware renderer', (name) => {
    expect(isSoftwareRenderer(name)).toBe(false)
  })
})

describe('recognizing a software renderer in a full renderer string', () => {
  it.each([
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 16.0.0)), SwiftShader driver)',
    'Mesa llvmpipe',
  ])('takes "%s" for a software renderer', (name) => {
    expect(isSoftwareRenderer(name)).toBe(true)
  })
})

describe('refusing a run whose conditions cannot measure', () => {
  it('has no reason to refuse good conditions', () => {
    expect(runRefusals(goodConditions())).toEqual([])
  })

  it('gives one reason for a development build', () => {
    const reasons = runRefusals({ ...goodConditions(), productionBuild: false })

    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toContain('development build')
  })

  it('gives one reason, naming WebGPU and that nothing was measured, for a missing adapter', () => {
    const reasons = runRefusals({ ...goodConditions(), webGpuAdapter: null })

    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toContain('WebGPU')
    expect(reasons[0]).toContain('nothing was measured')
  })

  it('gives one reason for a fallback adapter', () => {
    const webGpuAdapter = { name: 'apple / metal-3', isFallback: true }
    const reasons = runRefusals({ ...goodConditions(), webGpuAdapter })

    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toContain('fallback')
  })

  it('gives one reason for an adapter with a software name', () => {
    const webGpuAdapter = { name: 'Google SwiftShader', isFallback: false }
    const reasons = runRefusals({ ...goodConditions(), webGpuAdapter })

    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toContain('software renderer')
  })

  it('gives one reason, not two, for an adapter that is a fallback and has a software name', () => {
    const webGpuAdapter = { name: 'Google SwiftShader', isFallback: true }

    expect(runRefusals({ ...goodConditions(), webGpuAdapter })).toHaveLength(1)
  })

  it('gives one reason for a window that is not visible', () => {
    const reasons = runRefusals({ ...goodConditions(), visible: false })

    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toContain('hidden')
  })

  it('gives one reason when no display frame was measured', () => {
    const reasons = runRefusals({ ...goodConditions(), displayFrameMs: null })

    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toContain('No display frame')
  })

  it('gives one reason for a display frame of 40 ms', () => {
    const reasons = runRefusals({ ...goodConditions(), displayFrameMs: 40 })

    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toContain('throttling')
    expect(reasons[0]).toContain('34 ms')
  })

  it('accepts a display frame of exactly 34 ms', () => {
    expect(runRefusals({ ...goodConditions(), displayFrameMs: 34 })).toEqual([])
  })

  it('refuses a display frame of 34.1 ms', () => {
    expect(runRefusals({ ...goodConditions(), displayFrameMs: 34.1 })).toHaveLength(1)
  })

  it('gives one reason for each of two faults at once', () => {
    const observed = { ...goodConditions(), productionBuild: false, visible: false }

    expect(runRefusals(observed)).toHaveLength(2)
  })
})

describe('refusing to write a baseline from a run that is not a clean reference', () => {
  it('has no reason to refuse a clean run', () => {
    expect(baselineWriteRefusals(aTimingRun())).toEqual([])
  })

  it('gives one reason for a quick run', () => {
    const reasons = baselineWriteRefusals({ ...aTimingRun(), quick: true })

    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toContain('quick')
  })

  it('gives one reason for a run on battery power', () => {
    const run = aTimingRun()
    run.conditions.power = 'battery'

    const reasons = baselineWriteRefusals(run)

    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toContain('battery')
  })

  it('accepts a run whose power source is unknown', () => {
    const run = aTimingRun()
    run.conditions.power = 'unknown'

    expect(baselineWriteRefusals(run)).toEqual([])
  })

  it('gives one reason for a run with uncommitted changes', () => {
    const reasons = baselineWriteRefusals({ ...aTimingRun(), uncommittedChanges: true })

    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toContain('uncommitted')
  })

  it('gives one reason for a window that was not visible throughout', () => {
    const run = aTimingRun()
    run.conditions.visibleThroughout = false

    const reasons = baselineWriteRefusals(run)

    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toContain('visible')
  })

  it('gives one reason for an adapter with a software name', () => {
    const run = aTimingRun()
    run.machine.webGpuAdapter = 'Google SwiftShader'

    const reasons = baselineWriteRefusals(run)

    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toContain('software renderer')
  })
})
