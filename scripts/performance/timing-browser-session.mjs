// The browser session of the timing command: it launches the test browser, notes the processes
// that browser leaves behind on its own (its main process, its install folder, and the crash
// handler helpers it started), and closes it so that the close returns: once the main process is
// gone it stops those helpers, which would otherwise hold the browser's output open, and it bounds
// the wait for the close.

import { execFileSync } from 'node:child_process'
import { chromium } from '@playwright/test'
import {
  browserInstallRoot,
  browserMainPid,
  crashHandlerPids,
  newPids,
  parseProcessList,
  stillCrashHandlers,
} from './timing-browser-processes.mjs'
import { timingLaunchArgs } from './timing-launch.mjs'

// The longest wait for the browser to report that it closed. Chromium on macOS can leave its crash
// reporter holding the browser's output pipes, so the close may never report; the command goes on.
const BROWSER_CLOSE_LIMIT_MS = 10_000
// The longest wait for the browser's main process to exit after the close was asked; only then
// are its crash handlers stopped. A close takes about a second; the bounded close stays the net.
const MAIN_EXIT_LIMIT_MS = 10_000
// How often the wait looks whether the browser's main process still exists.
const MAIN_EXIT_POLL_MS = 50
// Room for the process list of a busy machine.
const PROCESS_LIST_MAX_BYTES = 64 * 1024 * 1024

/**
 * The text of a thrown value.
 * @param {unknown} error
 */
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The processes of the machine, from `ps`; empty on Windows or when `ps` fails, and then the
 * cleanup of the browser's crash handlers does nothing.
 * @returns {import('./timing-browser-processes.mjs').ProcessRow[]}
 */
function readProcesses() {
  if (process.platform === 'win32') return []
  try {
    const text = execFileSync('ps', ['-Aww', '-o', 'pid=,ppid=,command='], {
      encoding: 'utf8',
      maxBuffer: PROCESS_LIST_MAX_BYTES,
    })
    return parseProcessList(text)
  } catch {
    return []
  }
}

/**
 * @typedef {{ mainPid: number | undefined, installRoot: string | undefined, crashHandlers: number[] }} NotedProcesses
 */

/**
 * The processes that each launched browser leaves behind on its own: its main process, the folder
 * it runs from, and the crash handler helpers it started from that folder, which `closeBrowser`
 * stops.
 * @type {WeakMap<object, NotedProcesses>}
 */
const launchedProcesses = new WeakMap()

/**
 * Launches Chromium with the timing flags, the channel of the scene-webgl project, and notes the
 * browser's main process and its crash handler helpers for `closeBrowser`.
 * @param {boolean} [headless] false (the default) opens a visible window, as a timing run needs
 */
export async function launchTimingBrowser(headless = false) {
  const before = readProcesses()
  const browser = await chromium.launch({
    channel: 'chromium',
    headless,
    args: timingLaunchArgs(process.platform),
  })
  const after = readProcesses()
  const mainPid = browserMainPid(after, process.pid)
  const installRoot = browserInstallRoot(after, mainPid)
  // The helpers have parent 1 from the start and nothing in them names their browser, so they
  // are found by time and by folder: the helpers that appeared during this launch and run from
  // this browser's own install folder. Known limit: another test browser of the same install
  // that starts during this launch could have its helpers counted as this one's; stopping them
  // costs that browser only its crash reports.
  launchedProcesses.set(browser, {
    mainPid,
    installRoot,
    crashHandlers: newPids(
      crashHandlerPids(before, installRoot),
      crashHandlerPids(after, installRoot),
    ),
  })
  return browser
}

/** @param {number} pid */
function isRunning(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Waits until the process is gone, polling, for at most the limit. True when it is gone.
 * @param {number} pid
 */
async function waitForExit(pid) {
  const startMs = Date.now()
  while (isRunning(pid)) {
    if (Date.now() - startMs > MAIN_EXIT_LIMIT_MS) return false
    await new Promise((resolve) => setTimeout(resolve, MAIN_EXIT_POLL_MS))
  }
  return true
}

/**
 * After the browser's main process has exited, stops the crash handlers noted at its launch that
 * are still crash handlers now. A handler that outlives its browser holds the browser's error
 * output open, and the close does not report until that output closes. Does nothing when the
 * main process is not known or does not exit in time.
 * @param {NotedProcesses | undefined} noted
 */
async function stopCrashHandlers(noted) {
  if (noted?.mainPid === undefined || !(await waitForExit(noted.mainPid))) return
  const current = readProcesses()
  for (const pid of stillCrashHandlers(noted.crashHandlers, current, noted.installRoot)) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      // The handler exited between the process list and the signal: nothing is left to stop.
    }
  }
}

/**
 * Closes the browser: asks it to close, stops its own crash handlers once its main process is
 * gone (see `stopCrashHandlers`), then waits for the close to report, bounded. Goes on with a note
 * when the close has not reported in time or failed: the outcome of the run is kept either way.
 * @param {Pick<import('@playwright/test').Browser, 'close'>} browser
 */
export async function closeBrowser(browser) {
  const closing = browser.close().then(
    () => 'closed',
    (error) => {
      console.error(`The browser failed to close (${errorMessage(error)}); going on.`)
      return 'failed'
    },
  )
  await stopCrashHandlers(launchedProcesses.get(browser))
  let timer
  const late = new Promise((resolve) => {
    timer = setTimeout(() => resolve('late'), BROWSER_CLOSE_LIMIT_MS)
  })
  try {
    const result = await Promise.race([closing, late])
    if (result === 'late') console.error('The browser did not report its close in time; going on.')
  } finally {
    clearTimeout(timer)
  }
}
