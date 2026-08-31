/** The user-facing channel a failed step reports through; each feature's composition root (the plan view, the
 *  underlay provider) supplies the notification store's error toast. */
export type NotifyUser = (message: string) => void
