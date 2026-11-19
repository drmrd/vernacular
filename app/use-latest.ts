import { useLayoutEffect, useRef, type RefObject } from 'react'

/**
 * A ref that holds the value of the latest committed render. It is set in a layout effect, so a
 * handler that runs between the commit and the passive effects reads the value that was committed.
 */
export function useLatest<T>(value: T): RefObject<T> {
  const latest = useRef(value)
  useLayoutEffect(() => {
    latest.current = value
  }, [value])
  return latest
}
