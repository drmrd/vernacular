import type { SessionPorts } from '../session'

/**
 * The closes that an owner of the open project started and that have not settled, kept for each
 * ports object. A weak map holds them, so the ports and their closes are not kept alive.
 */
const pendingCloses = new WeakMap<SessionPorts, Set<Promise<unknown>>>()

/** Records a close for the ports until it settles. */
export function recordPendingClose(ports: SessionPorts, closing: Promise<unknown>): void {
  const closes = pendingCloses.get(ports) ?? new Set<Promise<unknown>>()
  pendingCloses.set(ports, closes)
  closes.add(closing)
  const forget = (): void => {
    closes.delete(closing)
  }
  closing.then(forget, forget)
}

/**
 * Runs the step after every close recorded for the ports has settled. With none recorded it runs
 * the step at once, so an open on ports with no close does not wait.
 */
export function afterPendingCloses<Result>(
  ports: SessionPorts,
  step: () => Promise<Result>,
): Promise<Result> {
  const closes = pendingCloses.get(ports)
  if (closes === undefined || closes.size === 0) {
    return step()
  }
  return Promise.allSettled([...closes]).then(step)
}
