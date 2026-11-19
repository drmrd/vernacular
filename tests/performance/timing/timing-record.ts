/** The summary of one list of samples, in milliseconds. */
export interface TimingSummary {
  samples: number
  medianMs: number
  p95Ms: number
}

/** How many samples a phase discards before it times, and how many it times. */
export interface SampleCounts {
  warmup: number
  timed: number
}

/** A size in pixels. */
export interface PixelSize {
  width: number
  height: number
}

/** A size as the report prints it, such as "960 x 600". */
export function sizeText(size: PixelSize): string {
  return `${size.width} x ${size.height}`
}

/** One frame of the 3D view timed two ways. */
export interface FrameTiming {
  /** Start to end of the frame callback: the main-thread work of the frame. */
  mainThread: TimingSummary
  /** Start of the frame callback until the GPU reports the frame's work done. */
  untilGpuDone: TimingSummary
}

/** One run of the timing command; the baseline file has the same shape. */
export interface TimingRun {
  format: 1
  quick: boolean
  commit: string
  uncommittedChanges: boolean
  takenAt: string // ISO 8601 with offset
  build: { mode: 'production'; timerResolutionMs: number }
  machine: {
    processor: string
    logicalCores: number
    memoryGiB: number
    operatingSystem: string
    browser: string
    webGpuAdapter: string // "vendor / architecture / device"
    webGlRenderer: string // unmasked renderer string
    renderer: 'webgpu'
  }
  conditions: {
    visibleThroughout: boolean
    focused: boolean
    power: 'mains' | 'battery' | 'unknown'
    devicePixelRatio: number
    displayFrameMs: number
    planCanvasPx: PixelSize
    sceneCanvasCssPx: PixelSize
    sceneDrawingBufferPx: PixelSize
  }
  method: Record<'planRedraw' | 'sceneUpdate' | 'renderFrame' | 'renderAfterEdit', SampleCounts>
  times: {
    planRedraw: TimingSummary
    sceneUpdate: Record<string, TimingSummary> // by reference edit name
    renderFrame: Record<string, FrameTiming> // by render variant name
    renderAfterEdit: Record<string, FrameTiming> // by reference edit name
  }
}

const TIMING_RUN_FORMAT = 1
const JSON_INDENT = 2

/**
 * The run as JSON with two-space indent and a final newline, keys in the order of the type above
 * whatever the insertion order of the given object; the entries of the free-keyed records keep
 * the order they have. The run is checked and rebuilt first, so a run that fails the check throws
 * here, at write time, instead of landing in a file that gets committed.
 */
export function serializeTimingRun(run: TimingRun): string {
  return `${JSON.stringify(parseTimingRun(run), null, JSON_INDENT)}\n`
}

type Reader<Value> = (value: unknown, path: string) => Value

function describe(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'an array'
  if (typeof value === 'number') return String(value)
  return typeof value === 'undefined' ? 'missing' : `a ${typeof value}`
}

function mismatch(path: string, expected: string, value: unknown): Error {
  const location = path === '' ? 'the run' : path
  return new Error(`Invalid timing run: ${location} must be ${expected}, found ${describe(value)}`)
}

function childPath(path: string, key: string): string {
  return path === '' ? key : `${path}.${key}`
}

const readNumber: Reader<number> = (value, path) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw mismatch(path, 'a finite number', value)
  }
  return value
}

const readCount: Reader<number> = (value, path) => {
  const number = readNumber(value, path)
  if (!Number.isInteger(number) || number < 0) {
    throw mismatch(path, 'a whole number of zero or more', value)
  }
  return number
}

const readMeasure: Reader<number> = (value, path) => {
  const number = readNumber(value, path)
  if (number < 0) throw mismatch(path, 'a finite number of zero or more', value)
  return number
}

const readString: Reader<string> = (value, path) => {
  if (typeof value !== 'string') throw mismatch(path, 'a string', value)
  return value
}

const readBoolean: Reader<boolean> = (value, path) => {
  if (typeof value !== 'boolean') throw mismatch(path, 'a boolean', value)
  return value
}

function readOneOf<Choice extends string | number>(choices: readonly Choice[]): Reader<Choice> {
  return (value, path) => {
    const choice = choices.find((candidate) => candidate === value)
    if (choice === undefined) {
      throw mismatch(
        path,
        `one of ${choices.map((each) => JSON.stringify(each)).join(', ')}`,
        value,
      )
    }
    return choice
  }
}

function readObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw mismatch(path, 'an object', value)
  }
  return value as Record<string, unknown>
}

function openObject(
  value: unknown,
  path: string,
): <Value>(key: string, read: Reader<Value>) => Value {
  const object = readObject(value, path)
  return (key, read) => read(object[key], childPath(path, key))
}

function readRecordOf<Value>(read: Reader<Value>): Reader<Record<string, Value>> {
  return (value, path) => {
    const object = readObject(value, path)
    const field = openObject(object, path)
    return Object.fromEntries(Object.keys(object).map((key) => [key, field(key, read)]))
  }
}

const readSummary: Reader<TimingSummary> = (value, path) => {
  const field = openObject(value, path)
  return {
    samples: field('samples', readCount),
    medianMs: field('medianMs', readMeasure),
    p95Ms: field('p95Ms', readMeasure),
  }
}

const readFrameTiming: Reader<FrameTiming> = (value, path) => {
  const field = openObject(value, path)
  return {
    mainThread: field('mainThread', readSummary),
    untilGpuDone: field('untilGpuDone', readSummary),
  }
}

const readSampleCounts: Reader<SampleCounts> = (value, path) => {
  const field = openObject(value, path)
  return {
    warmup: field('warmup', readCount),
    timed: field('timed', readCount),
  }
}

const readPixelSize: Reader<PixelSize> = (value, path) => {
  const field = openObject(value, path)
  return {
    width: field('width', readMeasure),
    height: field('height', readMeasure),
  }
}

const readBuild: Reader<TimingRun['build']> = (value, path) => {
  const field = openObject(value, path)
  return {
    mode: field('mode', readOneOf(['production'] as const)),
    timerResolutionMs: field('timerResolutionMs', readMeasure),
  }
}

const readMachine: Reader<TimingRun['machine']> = (value, path) => {
  const field = openObject(value, path)
  return {
    processor: field('processor', readString),
    logicalCores: field('logicalCores', readCount),
    memoryGiB: field('memoryGiB', readMeasure),
    operatingSystem: field('operatingSystem', readString),
    browser: field('browser', readString),
    webGpuAdapter: field('webGpuAdapter', readString),
    webGlRenderer: field('webGlRenderer', readString),
    renderer: field('renderer', readOneOf(['webgpu'] as const)),
  }
}

const readConditions: Reader<TimingRun['conditions']> = (value, path) => {
  const field = openObject(value, path)
  return {
    visibleThroughout: field('visibleThroughout', readBoolean),
    focused: field('focused', readBoolean),
    power: field('power', readOneOf(['mains', 'battery', 'unknown'] as const)),
    devicePixelRatio: field('devicePixelRatio', readMeasure),
    displayFrameMs: field('displayFrameMs', readMeasure),
    planCanvasPx: field('planCanvasPx', readPixelSize),
    sceneCanvasCssPx: field('sceneCanvasCssPx', readPixelSize),
    sceneDrawingBufferPx: field('sceneDrawingBufferPx', readPixelSize),
  }
}

const readMethod: Reader<TimingRun['method']> = (value, path) => {
  const field = openObject(value, path)
  return {
    planRedraw: field('planRedraw', readSampleCounts),
    sceneUpdate: field('sceneUpdate', readSampleCounts),
    renderFrame: field('renderFrame', readSampleCounts),
    renderAfterEdit: field('renderAfterEdit', readSampleCounts),
  }
}

const readTimes: Reader<TimingRun['times']> = (value, path) => {
  const field = openObject(value, path)
  return {
    planRedraw: field('planRedraw', readSummary),
    sceneUpdate: field('sceneUpdate', readRecordOf(readSummary)),
    renderFrame: field('renderFrame', readRecordOf(readFrameTiming)),
    renderAfterEdit: field('renderAfterEdit', readRecordOf(readFrameTiming)),
  }
}

/** Reads a run file or the baseline. Throws an Error naming the first missing or mistyped field. */
export function parseTimingRun(json: unknown): TimingRun {
  const field = openObject(json, '')
  return {
    format: field('format', readOneOf([TIMING_RUN_FORMAT] as const)),
    quick: field('quick', readBoolean),
    commit: field('commit', readString),
    uncommittedChanges: field('uncommittedChanges', readBoolean),
    takenAt: field('takenAt', readString),
    build: field('build', readBuild),
    machine: field('machine', readMachine),
    conditions: field('conditions', readConditions),
    method: field('method', readMethod),
    times: field('times', readTimes),
  }
}
