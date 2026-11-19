// The instruments come first: evaluating this import installs the frame probe and the visibility
// listener before any module of React, React Three Fiber, or three runs.
import { pageInstruments } from './page-instruments'
import { runTiming, type TimingInput, type TimingOutcome } from '../run-timing'
import { createPagePhases } from './page-phases'

declare global {
  interface Window {
    /**
     * Runs every phase of a timing run once and resolves with its outcome. The timing command's
     * driver calls it with one `page.evaluate`; nothing polls the page while it runs. It rejects
     * when a phase cannot measure (no frame within 2 s, a failed live view), with the reason.
     */
    vernacularTiming?: (input: TimingInput) => Promise<TimingOutcome>
  }
}

window.vernacularTiming = async (input) => {
  const { phases, dispose } = createPagePhases(pageInstruments)
  try {
    return await runTiming(phases, input)
  } finally {
    dispose()
  }
}
