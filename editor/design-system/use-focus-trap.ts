import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'input:not([disabled])',
  'button:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusableDescendants(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getAttribute('tabindex') !== '-1',
  )
}

function trapTab(event: KeyboardEvent, container: HTMLElement): void {
  if (event.key !== 'Tab') {
    return
  }
  const focusable = focusableDescendants(container)
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (!first || !last) {
    return
  }
  const active = document.activeElement
  if (event.shiftKey && active === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

export function useFocusTrap<T extends HTMLElement = HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    const container = ref.current
    if (!container) {
      return
    }
    const opener = document.activeElement as HTMLElement | null
    focusableDescendants(container)[0]?.focus()
    const onKeyDown = (event: KeyboardEvent) => trapTab(event, container)
    container.addEventListener('keydown', onKeyDown)
    return () => {
      container.removeEventListener('keydown', onKeyDown)
      // Skip the restore when the caller has already moved focus to a live element
      // outside the trap (e.g. its own close handler restored the opener); otherwise
      // we would redundantly re-focus, or clobber a deliberate handoff. Unmounting a
      // child blurs it to <body>, so that case still falls through to restore.
      const active = document.activeElement as HTMLElement | null
      const focusMovedOutByCaller =
        active !== null &&
        active !== document.body &&
        active.isConnected &&
        !container.contains(active)
      if (!focusMovedOutByCaller) {
        opener?.focus()
      }
    }
  }, [])
  return ref
}
