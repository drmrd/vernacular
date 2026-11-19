import type { FrameSample } from './frame-probe'

function noFramesRefusal(name: string, samples: readonly FrameSample[]): string | undefined {
  return samples.length === 0
    ? `The phase returned no frames for "${name}", so there is nothing to time and the run was discarded. ` +
        'Run again; if it repeats, the timing page failed to draw that entry and needs a fix.'
    : undefined
}

function gpuLostRefusal(samples: readonly FrameSample[]): string | undefined {
  return samples.some((sample) => sample.gpuLost)
    ? 'The GPU device was lost during the run, so the times were discarded. ' +
        'Run again; if it repeats, update the graphics driver or the browser.'
    : undefined
}

function hiddenRefusal(samples: readonly FrameSample[]): string | undefined {
  return samples.some((sample) => sample.hidden)
    ? 'The window was hidden during the run, so the times were discarded. ' +
        'Keep the browser window visible and in front for the whole run.'
    : undefined
}

function gpuWorkRefusal(name: string, samples: readonly FrameSample[]): string | undefined {
  const framesWithGpuWork = samples.filter((sample) => sample.untilGpuDoneMs !== null).length
  if (framesWithGpuWork === 0) {
    return (
      `The frames of "${name}" made no WebGPU work, so the renderer fell back to WebGL 2 ` +
      'and the times were discarded. A fallback figure is never kept.'
    )
  }
  if (framesWithGpuWork < samples.length) {
    return (
      `The frames of "${name}" do not agree: some frames made no GPU work and the others did, ` +
      'so the times were discarded. Run again; if it repeats, the renderer is dropping work.'
    )
  }
  return undefined
}

function entryRefusal(name: string, samples: readonly FrameSample[]): string | undefined {
  return (
    noFramesRefusal(name, samples) ??
    gpuLostRefusal(samples) ??
    hiddenRefusal(samples) ??
    gpuWorkRefusal(name, samples)
  )
}

/**
 * The reasons that the frames of a phase cannot be kept, empty when they can. Each entry (a render
 * variant or an edit) gives at most one reason, the first of: no frames, a lost device, a hidden
 * frame, no GPU work in any frame (WebGL 2), no GPU work in some frames. Equal reasons count once.
 */
export function frameRefusals(frames: Record<string, FrameSample[]>): string[] {
  const reasons = Object.entries(frames).map(([name, samples]) => entryRefusal(name, samples))
  const found = reasons.filter((reason): reason is string => reason !== undefined)
  return [...new Set(found)]
}
