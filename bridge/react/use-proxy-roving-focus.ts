import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'

const OPTION_SELECTOR = '[role="option"]'

export interface ProxyRovingFocus {
  focusIndex: number
  containerRef: RefObject<HTMLDivElement | null>
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}

function nextIndex(key: string, current: number, count: number): number {
  if (key === 'ArrowDown' || key === 'ArrowRight') return (current + 1) % count
  if (key === 'ArrowUp' || key === 'ArrowLeft') return (current - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return current
}

/** Roving-tabindex focus for the 3D proxy options: one option in the tab order at a time,
 *  arrow/Home/End move DOM focus. A minimal copy of the plan overlay's pattern, since the
 *  bridge layer cannot import the editor layer. */
export function useProxyRovingFocus(count: number): ProxyRovingFocus {
  const [focusIndex, setFocusIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setFocusIndex((current) => Math.min(current, Math.max(0, count - 1)))
  }, [count])

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (count === 0) return
      const next = nextIndex(event.key, focusIndex, count)
      if (next === focusIndex) return
      event.preventDefault()
      setFocusIndex(next)
      containerRef.current?.querySelectorAll<HTMLElement>(OPTION_SELECTOR)[next]?.focus()
    },
    [count, focusIndex],
  )

  return { focusIndex, containerRef, onKeyDown }
}
