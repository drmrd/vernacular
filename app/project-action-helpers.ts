import { useCallback } from 'react'
import type { DocumentHandle } from '../session'
import type { StorageCapabilities } from '../storage'
import type { FlowRefusal } from './open-failure-text'
import type { Flow, RunFlow } from './use-open-project'
import { useSwitchNotices, type FlowNoticeOptions } from './use-switch-notices'

/** What the Project menu shows for one recent project. */
export interface RecentEntry {
  id: string
  name: string
}

/** What an adapter needs to run a flow that may replace the open project. */
export interface SwitchFlowContext {
  handle: DocumentHandle
  runFlow: RunFlow
  capabilities: StorageCapabilities
}

/** How a switch reports what its flow gave. */
export type SwitchOptions = FlowNoticeOptions

/** Runs a flow through the owner, then reports what it gave. */
export type RunSwitch = <Refusal extends FlowRefusal = never>(
  flow: Flow<Refusal>,
  options?: SwitchOptions,
) => Promise<void>

/**
 * Gives a function that runs a flow through the owner and shows a result of any kind. A flow that
 * the owner did not run shows nothing. The handle records the projects it opens and saves in the
 * project index, so no adapter keeps a list.
 */
export function useSwitchFlow(context: SwitchFlowContext): RunSwitch {
  const { runFlow } = context
  const notify = useSwitchNotices()
  return useCallback(
    async <Refusal extends FlowRefusal = never>(flow: Flow<Refusal>, options?: SwitchOptions) => {
      const result = await runFlow(flow)
      notify(result, options)
    },
    [runFlow, notify],
  )
}
