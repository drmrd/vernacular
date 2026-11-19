import { useCallback } from 'react'
import { useNotifications } from '../editor/design-system'
import type { SwitchResult } from '../session'

export const SAVE_FAILED_DURING_SWITCH =
  'The changes could not be saved, so the project stays open.'

/** Gives a function that shows what a switch result means to the user. */
export function useSwitchNotices(): (result: SwitchResult) => void {
  const { error } = useNotifications()
  return useCallback(
    (result: SwitchResult) => {
      if (!result.ok && result.failure.kind === 'flush-failed') {
        error(SAVE_FAILED_DURING_SWITCH)
      }
    },
    [error],
  )
}
