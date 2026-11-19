/**
 * Pure helpers that find the timing browser's crash handler processes in a
 * process list. The handlers are orphaned from the start (parent id 1) and
 * nothing in their command line links them to their browser, so the browser
 * session (timing-browser-session.mjs) notes them before and after it launches
 * its browser, and accepts only those inside the folder of the browser it
 * launched.
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

/** Suffix of a macOS application bundle folder. */
const BUNDLE_SUFFIX = '.app'

/** Path inside an application bundle that leads to its executables. */
const BUNDLE_EXECUTABLE_PATH = `${BUNDLE_SUFFIX}/Contents/MacOS/`

/** Argument that marks the browser's main process (driver pipe). */
const BROWSER_PIPE_ARGUMENT = '--remote-debugging-pipe'

/** Separator that starts the arguments of a command. */
const ARGUMENT_SEPARATOR = ' --'

/** The browser pipe argument as a whole token: bounded by spaces or the command ends. */
const BROWSER_PIPE_TOKEN = new RegExp(`(?:^| )${BROWSER_PIPE_ARGUMENT}(?: |$)`)

/** One `ps` line: pid, parent pid, then the whole command text. */
const PROCESS_LINE = /^\s*(\d+)\s+(\d+)\s+(.*\S)\s*$/

/**
 * Parses the output of `ps -Aww -o pid=,ppid=,command=`.
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
 * Returns the folder that holds the browser of the main process: the
 * application bundle for a macOS bundle executable, otherwise the directory of
 * the executable: the text before its last slash. Returns undefined when the
 * pid is undefined or not listed, and when the executable holds no slash or
 * sits directly under the file system root (the directory text is empty).
 * @param {ProcessRow[]} processes
 * @param {number | undefined} mainPid
 * @returns {string | undefined}
 */
export function browserInstallRoot(processes, mainPid) {
  if (mainPid === undefined) return undefined
  const row = processes.find((candidate) => candidate.pid === mainPid)
  if (row === undefined) return undefined
  const executable = executableOf(row.command)
  const bundleIndex = executable.indexOf(BUNDLE_EXECUTABLE_PATH)
  if (bundleIndex !== -1) return executable.slice(0, bundleIndex + BUNDLE_SUFFIX.length)
  const directoryEnd = executable.lastIndexOf('/')
  return directoryEnd > 0 ? executable.slice(0, directoryEnd) : undefined
}

/**
 * Returns the ids, in list order, of processes with parent id 1 whose
 * executable name ends with the crash handler name and lies inside the install
 * root. The folder is part of the rule because other programs built on the same
 * browser engine run a helper with the same name. Without a root (undefined or
 * an empty string) it returns an empty list.
 * @param {ProcessRow[]} processes
 * @param {string | undefined} installRoot
 * @returns {number[]}
 */
export function crashHandlerPids(processes, installRoot) {
  if (installRoot === undefined || installRoot === '') return []
  const rootPrefix = `${installRoot}/`
  return processes
    .filter((row) => {
      const executable = executableOf(row.command)
      return (
        row.ppid === ORPHAN_PARENT_PID &&
        executable.endsWith(CRASH_HANDLER_EXECUTABLE) &&
        executable.startsWith(rootPrefix)
      )
    })
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
 * Returns the given ids, in their order, that are crash handlers of the install root in the process list now.
 * Without a root (undefined or an empty string) it returns an empty list.
 * @param {number[]} pids
 * @param {ProcessRow[]} processes
 * @param {string | undefined} installRoot
 * @returns {number[]}
 */
export function stillCrashHandlers(pids, processes, installRoot) {
  const current = new Set(crashHandlerPids(processes, installRoot))
  return pids.filter((pid) => current.has(pid))
}
