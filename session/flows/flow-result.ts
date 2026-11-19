import type { DocumentHandle } from '../handle/handle-types'
import type { SwitchResult } from './switch-project'

/** Why a switch did not happen: the failed flush, or the open failure of the target. */
export type SwitchFailure = Extract<SwitchResult, { readonly ok: false }>['failure']

/** What a flow gives: the handle now open, or why the current project stays open. */
export type FlowResult<Refusal = never> =
  | { readonly ok: true; readonly handle: DocumentHandle }
  | { readonly ok: false; readonly failure: SwitchFailure | Refusal }
