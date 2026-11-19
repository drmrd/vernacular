import type { DocumentHandle } from '../handle/handle-types'
import type { SwitchResult } from './switch-project'

/** Why a switch did not happen: the failed flush, or the open failure of the target. */
export type SwitchFailure = Extract<SwitchResult, { readonly ok: false }>['failure']

/** The result of a flow that stopped because the current project could not be flushed. */
export function flushFailed(): {
  readonly ok: false
  readonly failure: { readonly kind: 'flush-failed' }
} {
  return { ok: false, failure: { kind: 'flush-failed' } }
}

/** What a flow gives: the handle now open, or why the current project stays open. */
export type FlowResult<Refusal = never> =
  | { readonly ok: true; readonly handle: DocumentHandle }
  | { readonly ok: false; readonly failure: SwitchFailure | Refusal }
