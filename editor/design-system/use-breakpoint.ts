import { useEffect, useState, type RefObject } from 'react'

export type Breakpoint = 'wide' | 'medium' | 'narrow'

export const WIDE_MIN_WIDTH = 1024
export const MEDIUM_MIN_WIDTH = 640

export function breakpointForWidth(width: number): Breakpoint {
  if (width >= WIDE_MIN_WIDTH) {
    return 'wide'
  }
  if (width >= MEDIUM_MIN_WIDTH) {
    return 'medium'
  }
  return 'narrow'
}

export function useBreakpoint(ref: RefObject<HTMLElement | null>): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>('wide')
  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? element.clientWidth
      setBreakpoint(breakpointForWidth(width))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return breakpoint
}
