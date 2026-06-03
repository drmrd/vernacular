/**
 * A command describes a single state mutation that is looked up by its string
 * `type` and applied by a registered handler. This keeps the mutation boundary
 * data-driven: callers name the change rather than reaching into the model.
 */

export interface Command<P = unknown> {
  type: string
  params: P
  description: string
  /**
   * Merges this command with the immediately preceding one so a continuous
   * gesture (such as a drag) collapses into a single undoable step instead of
   * flooding the history with one entry per frame. Returns the merged command,
   * or `null` to keep the two commands as separate history entries.
   */
  coalesceWith?(previous: Command): Command | null
}

export interface CommandHandler<S, P> {
  /** Mutates the working `state` according to `params`. */
  apply(state: S, params: P): void
}
