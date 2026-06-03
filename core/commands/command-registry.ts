import type { CommandHandler } from './command'

export class CommandRegistry<S> {
  private readonly handlers = new Map<string, CommandHandler<S, unknown>>()

  register<P>(type: string, handler: CommandHandler<S, P>): this {
    // `apply` is a method, so its parameters are checked bivariantly; a
    // CommandHandler<S, P> is therefore assignable to CommandHandler<S, unknown>
    // without a cast.
    this.handlers.set(type, handler)
    return this
  }

  handlerFor(type: string): CommandHandler<S, unknown> | undefined {
    return this.handlers.get(type)
  }
}
