import { describe, expect, it } from 'vitest'
import { baselineWriteRefusals, isSoftwareRenderer, runRefusals } from './run-conditions'
import type { ObservedConditions } from './run-conditions'
import type { FrameTiming, TimingRun, TimingSummary } from './timing-record'

function summary(medianMs: number, p95Ms: number): TimingSummary {
  return { samples: 100, medianMs, p95Ms }
}

function frame(mainThreadMs: number, untilGpuDoneMs: number): FrameTiming {
  return {
    mainThread: summary(mainThreadMs, mainThreadMs + 1.5),
    untilGpuDone: summary(untilGpuDoneMs, untilGpuDoneMs + 2.25),
  }
}

/** Conditions that allow a measurement: a production build, a hardware adapter, a visible window. */
function goodConditions(): ObservedConditions {
  return {
    productionBuild: true,
    webGpuAdapter: { name: 'apple / metal-3 / Apple M5 Pro', isFallback: false },
    visible: true,
    displayFrameMs: 8.33,
  }
}

/** A finished run that may become the baseline. */
function aCleanRun(): TimingRun {
  return {
    format: 1,
    quick: false,
    commit: '4e51b3c9',
    uncommittedChanges: false,
    takenAt: '2026-11-21T10:02:11-05:00',
    build: { mode: 'production', timerResolutionMs: 0.005 },
    machine: {
      processor: 'Apple M5 Pro',
      logicalCores: 18,
      memoryGiB: 48,
      operatingSystem: 'macOS 26.1',
      browser: 'Chromium 142.0.7444.0',
      webGpuAdapter: 'apple / metal-3 / Apple M5 Pro',
      webGlRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Pro, Unspecified Version)',
      renderer: 'webgpu',
    },
    conditions: {
      visibleThroughout: true,
      focused: true,
      power: 'mains',
      devicePixelRatio: 2,
      displayFrameMs: 8.33,
      planCanvasPx: { width: 800, height: 600 },
      sceneCanvasCssPx: { width: 960, height: 600 },
      sceneDrawingBufferPx: { width: 1920, height: 1200 },
    },
    method: {
      planRedraw: { warmup: 20, timed: 200 },
      sceneUpdate: { warmup: 20, timed: 100 },
      renderFrame: { warmup: 30, timed: 100 },
      renderAfterEdit: { warmup: 30, timed: 100 },
    },
    times: {
      planRedraw: summary(3.21, 5.4),
      sceneUpdate: { moveWallEndpoint: summary(1.5, 2.75) },
      renderFrame: { floorSchematic: frame(1.2, 4.1) },
      renderAfterEdit: { moveWallEndpoint: frame(1.9, 5.3) },
    },
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

  it.each(['ANGLE Metal Renderer: Apple M2', 'apple / metal-3'])(
    'takes "%s" for a hardware renderer',
    (name) => {
      expect(isSoftwareRenderer(name)).toBe(false)
    },
  )
})

describe('refusing a run whose conditions cannot measure', () => {
  it('has no reason to refuse good conditions', () => {
    expect(runRefusals(goodConditions())).toEqual([])
  })

  it('gives one reason for a development build', () => {
    expect(runRefusals({ ...goodConditions(), productionBuild: false })).toHaveLength(1)
  })

  it('gives one reason, naming WebGPU and that nothing was measured, for a missing adapter', () => {
    const reasons = runRefusals({ ...goodConditions(), webGpuAdapter: null })

    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toContain('WebGPU')
    expect(reasons[0]).toContain('nothing was measured')
  })

  it('gives one reason for a fallback adapter', () => {
    const webGpuAdapter = { name: 'apple / metal-3', isFallback: true }

    expect(runRefusals({ ...goodConditions(), webGpuAdapter })).toHaveLength(1)
  })

  it('gives one reason for an adapter with a software name', () => {
    const webGpuAdapter = { name: 'Google SwiftShader', isFallback: false }

    expect(runRefusals({ ...goodConditions(), webGpuAdapter })).toHaveLength(1)
  })

  it('gives one reason for a window that is not visible', () => {
    expect(runRefusals({ ...goodConditions(), visible: false })).toHaveLength(1)
  })

  it('gives one reason when no display frame was measured', () => {
    expect(runRefusals({ ...goodConditions(), displayFrameMs: null })).toHaveLength(1)
  })

  it('gives one reason for a display frame of 40 ms', () => {
    expect(runRefusals({ ...goodConditions(), displayFrameMs: 40 })).toHaveLength(1)
  })

  it('gives one reason for each of two faults at once', () => {
    const observed = { ...goodConditions(), productionBuild: false, visible: false }

    expect(runRefusals(observed)).toHaveLength(2)
  })
})

describe('refusing to write a baseline from a run that is not a clean reference', () => {
  it('has no reason to refuse a clean run', () => {
    expect(baselineWriteRefusals(aCleanRun())).toEqual([])
  })

  it('gives one reason for a quick run', () => {
    expect(baselineWriteRefusals({ ...aCleanRun(), quick: true })).toHaveLength(1)
  })

  it('gives one reason for a run on battery power', () => {
    const run = aCleanRun()
    run.conditions.power = 'battery'

    expect(baselineWriteRefusals(run)).toHaveLength(1)
  })

  it('gives one reason for a run with uncommitted changes', () => {
    expect(baselineWriteRefusals({ ...aCleanRun(), uncommittedChanges: true })).toHaveLength(1)
  })

  it('gives one reason for a window that was not visible throughout', () => {
    const run = aCleanRun()
    run.conditions.visibleThroughout = false

    expect(baselineWriteRefusals(run)).toHaveLength(1)
  })

  it('gives one reason for an adapter with a software name', () => {
    const run = aCleanRun()
    run.machine.webGpuAdapter = 'Google SwiftShader'

    expect(baselineWriteRefusals(run)).toHaveLength(1)
  })
})
