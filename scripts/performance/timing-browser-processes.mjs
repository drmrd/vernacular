/**
 * Pure helpers that find the timing browser's crash handler processes in a
 * process list. The handlers are orphaned from the start (parent id 1) and
 * nothing in their command line links them to their browser, so the driver
 * notes them before and after it launches its browser.
 */

/**
 * @typedef {object} ProcessRow
 * @property {number} pid
 * @property {number} ppid
 * @property {string} command
 */

/** Parent id of an orphaned or double-forked process. */
const ORPHAN_PARENT_PID = 1

/** Executable name of the browser's crash handler helper. */
const CRASH_HANDLER_EXECUTABLE = '/chrome_crashpad_handler'

/** Argument that marks the browser's main process (driver pipe). */
const BROWSER_PIPE_ARGUMENT = '--remote-debugging-pipe'

/** Separator that starts the arguments of a command. */
const ARGUMENT_SEPARATOR = ' --'

/** The browser pipe argument as a whole token: bounded by spaces or the command ends. */
const BROWSER_PIPE_TOKEN = new RegExp(`(?:^| )${BROWSER_PIPE_ARGUMENT}(?: |$)`)

/** One `ps` line: pid, parent pid, then the whole command text. */
const PROCESS_LINE = /^\s*(\d+)\s+(\d+)\s+(.*\S)\s*$/

/**
 * Parses the output of `ps -Ao pid=,ppid=,command=`.
 * @param {string} text
 * @returns {ProcessRow[]}
 */
export function parseProcessList(text) {
  /** @type {ProcessRow[]} */
  const processes = []
  for (const line of text.split('\n')) {
    const match = PROCESS_LINE.exec(line)
    if (match) {
      processes.push({
        pid: Number(match[1]),
        ppid: Number(match[2]),
        command: match[3],
      })
    }
  }
  return processes
}

/**
 * Returns the executable part of a command, cut at the first space followed by
 * two hyphens; a path that itself contains that sequence is cut there too.
 * @param {string} command
 * @returns {string}
 */
function executableOf(command) {
  const index = command.indexOf(ARGUMENT_SEPARATOR)
  return index === -1 ? command : command.slice(0, index)
}

/**
 * Returns the ids, in list order, of processes with parent id 1 whose executable name ends with the crash handler name.
 * @param {ProcessRow[]} processes
 * @returns {number[]}
 */
export function crashHandlerPids(processes) {
  return processes
    .filter(
      (row) =>
        row.ppid === ORPHAN_PARENT_PID &&
        executableOf(row.command).endsWith(CRASH_HANDLER_EXECUTABLE),
    )
    .map((row) => row.pid)
}

/**
 * Returns the ids of `after`, in their order, that are not in `before`.
 * @param {number[]} before
 * @param {number[]} after
 * @returns {number[]}
 */
export function newPids(before, after) {
  const known = new Set(before)
  return after.filter((pid) => !known.has(pid))
}

/**
 * Returns the id of the first child of the driver whose command holds the browser pipe argument as a whole token, or undefined.
 * @param {ProcessRow[]} processes
 * @param {number} driverPid
 * @returns {number | undefined}
 */
export function browserMainPid(processes, driverPid) {
  return processes.find((row) => row.ppid === driverPid && BROWSER_PIPE_TOKEN.test(row.command))
    ?.pid
}

/**
 * Returns the given ids, in their order, that are crash handlers in the process list now.
 * @param {number[]} pids
 * @param {ProcessRow[]} processes
 * @returns {number[]}
 */
export function stillCrashHandlers(pids, processes) {
  const current = new Set(crashHandlerPids(processes))
  return pids.filter((pid) => current.has(pid))
}
