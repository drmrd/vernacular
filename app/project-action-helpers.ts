import { useCallback } from 'react'
import type { FlowRefusal } from './open-failure-text'
import type { Flow, RunFlow } from './use-open-project'
import { useSwitchNotices, type FlowNoticeOptions } from './use-switch-notices'

/** What the Project menu shows for one recent project. */
export interface RecentEntry {
  id: string
  name: string
}

/** Runs a flow through the owner, then reports what it gave. */
export type RunSwitch = <Refusal extends FlowRefusal = never>(
  flow: Flow<Refusal>,
  options?: FlowNoticeOptions,
) => Promise<void>

/**
 * Gives a function that runs a flow through the owner and shows a result of any kind. A flow that
 * the owner did not run shows nothing. The handle records the projects it opens and saves in the
 * project index, so no adapter keeps a list.
 */
export function useSwitchFlow({ runFlow }: { runFlow: RunFlow }): RunSwitch {
  const notify = useSwitchNotices()
  return useCallback(
    async <Refusal extends FlowRefusal = never>(
      flow: Flow<Refusal>,
      options?: FlowNoticeOptions,
    ) => {
      const result = await runFlow(flow)
      notify(result, options)
    },
    [runFlow, notify],
  )
}
