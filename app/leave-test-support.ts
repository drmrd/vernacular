/** Test support: the warning that the browser shows before it leaves the page. */

/** Dispatches a cancelable `beforeunload` event on the window, and says whether the application vetoed it. */
export function leaveIsPrevented(): boolean {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}
