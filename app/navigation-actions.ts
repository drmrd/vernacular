import { newProjectRequest } from '../session'
import { addressFor, START_ADDRESS } from './address'
import { createInitialProject } from './create-initial-project'
import { beginRead, followAgain, reopenFolder } from './follow-address'
import {
  flowGaveProject,
  handFirstRequest,
  ownerRetries,
  pageLeads,
  projectLeads,
  runOwnerFlow,
  showPage,
  type NavigationMemory,
} from './navigation-memory'
import type { RunAction, RunFlow } from './use-open-project'

/** The owner's way to run a flow, with one addition: a flow that opens another project adds an entry. */
export function runFlowOf(memory: NavigationMemory): RunFlow {
  return async (flow) => {
    try {
      return await runOwnerFlow(memory, async (ports, current) => {
        const result = await flow(ports, current)
        if (result.ok && result.handle !== current) {
          flowGaveProject(memory)
        }
        return result
      })
    } finally {
      memory.view.bump()
    }
  }
}

/**
 * Runs a flow from the page. When it gives a project, the page goes, and the next address write
 * adds an entry for that project. A flow that fails or is refused leaves the page and the address.
 */
export function runPageFlowOf(memory: NavigationMemory): RunFlow {
  const runFlow = runFlowOf(memory)
  return async (flow) => {
    const result = await runFlow(flow)
    if (result?.ok === true && memory.live) {
      showPage(memory, null)
      projectLeads(memory)
      memory.view.bump()
    }
    return result
  }
}

/**
 * Runs an action from the page. It adds no history entry and keeps the page and the address. When
 * the action ended the open project, the navigation forgets that project and the first request it
 * gave the owner, so the page shows with no project open and the owner is not seen as opening one.
 */
export function runPageActionOf(memory: NavigationMemory): RunAction {
  return async (action) => {
    memory.busy.flowsRunning += 1
    try {
      const outcome = await memory.owner.runAction(action)
      if (outcome?.currentClosed === true) {
        memory.handle = null
        memory.given = null
      }
      return outcome
    } finally {
      memory.busy.flowsRunning -= 1
      memory.view.bump()
    }
  }
}

/** Shows the page over the open project, with a new history entry for the page's address. */
export function showProjects(memory: NavigationMemory): void {
  const place = { kind: 'projects' } as const
  showPage(memory, {})
  pageLeads(memory, place)
  memory.address.push(addressFor(place))
  memory.view.bump()
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
  ownerRetries(memory)
  memory.owner.retry()
}

/** Leaves the page: back to the open project with a new entry, or to the start. */
export function leavePage(memory: NavigationMemory): void {
  showPage(memory, null)
  if (memory.handle !== null) {
    projectLeads(memory)
    memory.view.bump()
    return
  }
  memory.addressLeads = false
  memory.address.push(START_ADDRESS)
  if (memory.ports !== null) {
    beginRead(memory, memory.ports, { kind: 'start' })
  }
}

/**
 * Starts a new project under a new id. It waits for the ports. A repeat call while the first
 * start runs starts no second project when that start opens one. If that start fails, the
 * changed request launches after the failure.
 */
export function startFresh(memory: NavigationMemory): void {
  memory.busy.reading = null
  projectLeads(memory)
  showPage(memory, null)
  handFirstRequest(memory, memory.ports, newProjectRequest(createInitialProject))
}
