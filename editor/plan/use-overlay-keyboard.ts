import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import type { SelectionStore } from '../../bridge'
import { nextFocusIndex } from './overlay-keyboard'

const OPTION_SELECTOR = '[role="option"]'

export interface OverlayKeyboard {
  /** The roving-tabindex focus index; the matching proxy carries tabIndex 0, the rest -1. */
  focusIndex: number
  /** Ref for the overlay container, used to move DOM focus between proxies. */
  containerRef: RefObject<HTMLDivElement | null>
  /** Container keydown: arrow/Home/End move the roving focus; Escape clears the selection. */
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  /** Replace the selection with one entity, or toggle it into the selection when additive. */
  onSelect: (id: string, additive: boolean) => void
}

/**
 * Roving-tabindex focus management for the plan overlay proxies. Holds the focused
 * index, moves DOM focus on arrow/Home/End via nextFocusIndex, and clears the
 * selection on Escape. Composed alongside (not replacing) use-selection-keyboard,
 * which still owns the select-tool editing keystrokes on the window; Enter and
 * Space selection is handled by the focused EntityProxy itself.
 */
export function useOverlayKeyboard(count: number, selection: SelectionStore): OverlayKeyboard {
  const [focusIndex, setFocusIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Keep the roving index in range as proxies appear and disappear.
  useEffect(() => {
    setFocusIndex((current) => Math.min(current, Math.max(0, count - 1)))
  }, [count])

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        selection.clear()
        return
      }
      const next = nextFocusIndex(focusIndex, event.key, count)
      if (next === focusIndex) {
        return
      }
      event.preventDefault()
      setFocusIndex(next)
      containerRef.current?.querySelectorAll<HTMLElement>(OPTION_SELECTOR).item(next)?.focus()
    },
    [focusIndex, count, selection],
  )

  const onSelect = useCallback(
    (id: string, additive: boolean) => {
      if (additive) {
        selection.toggle(id)
      } else {
        selection.select(id)
      }
    },
    [selection],
  )

  return { focusIndex, containerRef, onKeyDown, onSelect }
}
