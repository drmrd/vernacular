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
