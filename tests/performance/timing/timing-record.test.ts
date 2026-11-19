import { describe, expect, it } from 'vitest'
import { parseTimingRun, serializeTimingRun } from './timing-record'
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

function aRun(): TimingRun {
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
      sceneUpdate: {
        moveWallEndpoint: summary(1.5, 2.75),
        addRoom: summary(2.1, 3.9),
      },
      renderFrame: {
        floorSchematic: frame(1.2, 4.1),
        buildingRealistic: frame(2.8, 7.6),
      },
      renderAfterEdit: {
        moveWallEndpoint: frame(1.9, 5.3),
      },
    },
  }
}

/**
 * The serialized run as plain JSON, changed by the given edit, ready to be parsed. The edit may
 * delete a field or put a value of the wrong type in it, which the types of a TimingRun forbid;
 * Reflect keeps the test free of casts.
 */
function recordAfter(edit: (record: TimingRun) => void): unknown {
  const record: TimingRun = JSON.parse(serializeTimingRun(aRun()))
  edit(record)
  return record
}

describe('writing and reading a timing run', () => {
  it('reads back the run it wrote', () => {
    const run = aRun()

    expect(parseTimingRun(JSON.parse(serializeTimingRun(run)))).toEqual(run)
  })

  it('ends the written text with exactly one newline', () => {
    const text = serializeTimingRun(aRun())

    expect(text).toMatch(/\}\n$/)
    expect(text).not.toMatch(/\n\n$/)
  })

  it('indents the written text by two spaces, with the record format first', () => {
    const text = serializeTimingRun(aRun())

    expect(text.startsWith('{\n  "format": 1,\n  "quick": false,\n')).toBe(true)
  })

  it('reads a run whose reference edits are an empty list', () => {
    const run = aRun()
    run.times.sceneUpdate = {}

    expect(parseTimingRun(JSON.parse(serializeTimingRun(run)))).toEqual(run)
  })
})

// The surface leaves the path syntax of an error message open. The tests read it as the
// dot-separated keys from the top of the run, such as machine.browser, with no prefix or index.
describe('rejecting a record that is not a timing run', () => {
  it('names machine.browser when the browser is missing', () => {
    const record = recordAfter((run) => Reflect.deleteProperty(run.machine, 'browser'))

    expect(() => parseTimingRun(record)).toThrow(/machine\.browser/)
  })

  it('names times.planRedraw.medianMs when a median is a string', () => {
    const record = recordAfter((run) => Reflect.set(run.times.planRedraw, 'medianMs', '3.21'))

    expect(() => parseTimingRun(record)).toThrow(/times\.planRedraw\.medianMs/)
  })

  it('names format when the record format is 2', () => {
    const record = recordAfter((run) => Reflect.set(run, 'format', 2))

    expect(() => parseTimingRun(record)).toThrow(/format/)
  })

  it('names build.mode when the build is a development build', () => {
    const record = recordAfter((run) => Reflect.set(run.build, 'mode', 'development'))

    expect(() => parseTimingRun(record)).toThrow(/build\.mode/)
  })
})
