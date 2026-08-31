/** The user-facing channel a failed step reports through; the plan view supplies
 *  the notification store's error toast. */
export type NotifyUser = (message: string) => void
