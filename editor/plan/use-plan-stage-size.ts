import { useEffect, type RefObject } from 'react'
import { useViewport } from './viewport-context'

/**
 * Reports the measured size of the plan stage element to the viewport context.
 *
 * The stage fills whatever pane the layout gives it, so its real size is only
 * known after layout. Observing it lets the viewport fit the plan to the pane
 * instead of to a guessed opening size. A 0x0 entry is still reported; the
 * context ignores it, which keeps this hook free of that policy.
 */
export function usePlanStageSize(ref: RefObject<HTMLElement | null>): void {
  const { reportStageSize } = useViewport()
  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        reportStageSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, reportStageSize])
}
