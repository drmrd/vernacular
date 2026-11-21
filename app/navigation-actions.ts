import { newProjectId } from '../storage'
import { createInitialProject } from './create-initial-project'
import { beginRead, followAgain, reopenFolder } from './follow-address'
import { handFirstRequest, showPage, type NavigationMemory } from './navigation-memory'
import type { RunFlow } from './use-open-project'

/** The owner's way to run a flow, with one addition: a flow that opens another project adds an entry. */
export function runFlowOf(memory: NavigationMemory): RunFlow {
  return async (flow) => {
    memory.flowRunning = true
    try {
      return await memory.owner.runFlow(async (ports, current) => {
        const result = await flow(ports, current)
        if (result.ok && result.handle !== current) {
          memory.pushNext = true
          memory.followed = null
        }
        return result
      })
    } finally {
      memory.flowRunning = false
      memory.view.bump()
    }
  }
}

/** Tries again what the notice says did not work. */
export function retryNotice(memory: NavigationMemory): void {
  if (memory.handle === null) {
    retryWithNothingOpen(memory)
    return
  }
  const notice = memory.page?.notice
  if (notice === undefined) {
    return
  }
  if (notice.failure.kind === 'folder-permission') {
    reopenFolder(memory, notice.id)
  } else {
    followAgain(memory)
  }
}

function retryWithNothingOpen(memory: NavigationMemory): void {
  const { failure, triedId } = memory
  if (failure === null) {
    return
  }
  if (failure.kind === 'folder-permission' && triedId !== null) {
    reopenFolder(memory, triedId)
    return
  }
  if (!memory.flowRunning) {
    memory.starting = true
  }
  memory.owner.retry()
}

/** Leaves the page: back to the open project with a new entry, or to the start. */
export function leavePage(memory: NavigationMemory): void {
  memory.addressLeads = false
  showPage(memory, null)
  if (memory.handle !== null) {
    memory.pushNext = true
    memory.followed = null
    memory.view.bump()
    return
  }
  memory.address.push('')
  if (memory.ports !== null) {
    beginRead(memory, memory.ports, { kind: 'start' })
  }
}

/** Starts a new project under a new id, once for each failure. It waits for the ports. */
export function startFresh(memory: NavigationMemory): void {
  const { failure } = memory
  if (memory.freshStartFor !== null && memory.freshStartFor.failure === failure) {
    return
  }
  memory.freshStartFor = { failure }
  memory.reading = null
  memory.addressLeads = false
  memory.pushNext = true
  memory.followed = null
  showPage(memory, null)
  const request = {
    id: newProjectId([]),
    location: { kind: 'workspace' } as const,
    create: createInitialProject,
  }
  handFirstRequest(memory, memory.ports, request)
}
