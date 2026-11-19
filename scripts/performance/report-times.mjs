// The driver of `pnpm perf:report`: it builds the timing page in production mode, serves it
// cross-origin isolated, opens it in a visible Chromium window on the GPU, runs every phase with
// one call into the page, and prints and keeps the result. Each step is an exported function, so
// a step can be called alone. A time never changes the exit code: 0 measured, 2 refused or could
// not measure, 1 an error.

import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'
import react from '@vitejs/plugin-react'
import { build, preview } from 'vite'
import { baselineWriteRefusals } from '../../tests/performance/timing/run-conditions.ts'
import { parseTimingRun, serializeTimingRun } from '../../tests/performance/timing/timing-record.ts'
import { parseTimingArguments } from './timing-arguments.mjs'
import {
  browserInstallRoot,
  browserMainPid,
  crashHandlerPids,
  newPids,
  parseProcessList,
  stillCrashHandlers,
} from './timing-browser-processes.mjs'
import { judgeConsole } from './timing-console.mjs'
import { timingLaunchArgs } from './timing-launch.mjs'

/** @typedef {import('./timing-arguments.mjs').TimingOptions} TimingOptions */
/** @typedef {import('../../tests/performance/timing/run-timing.ts').HostDescription} HostDescription */
/** @typedef {import('../../tests/performance/timing/run-timing.ts').TimingInput} TimingInput */
/** @typedef {import('../../tests/performance/timing/run-timing.ts').TimingOutcome} TimingOutcome */
/** @typedef {import('./timing-console.mjs').PageMessage} PageMessage */

export const EXIT_MEASURED = 0
export const EXIT_ERROR = 1
export const EXIT_NOT_MEASURED = 2

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const PAGE_ROOT = path.join(REPOSITORY_ROOT, 'tests/performance/timing/page')
const CACHE_DIRECTORY = path.join(REPOSITORY_ROOT, 'node_modules/.cache/performance-timing')
const PAGE_OUT_DIRECTORY = path.join(CACHE_DIRECTORY, 'page')
const BASELINE_FILE = path.join(REPOSITORY_ROOT, 'tests/performance/baseline-times.json')
const COMMIT_PREFIX_LENGTH = 8
const BYTES_PER_GIB = 1024 ** 3
// The page is one bundle with three and React in it; the size warning of an app build says
// nothing about a page that is never shipped.
const PAGE_CHUNK_WARNING_KIB = 20_000
// The longest run of the page function. A full run takes minutes; a page that has not answered by
// then hangs (in an adapter or battery request, say), and the command must end with a reason.
const MILLISECONDS_PER_MINUTE = 60_000
const RUN_LIMIT_MS = 30 * MILLISECONDS_PER_MINUTE
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
// The pause before the process ends by itself, so the last output lines are flushed first.
const EXIT_DELAY_MS = 200
const CROSS_ORIGIN_ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export const USAGE = `Usage: pnpm perf:report [--quick] [--out <path>] [--baseline <path>] [--write-baseline]

Times the reference project in a production build of the timing page, in a visible Chromium
window on a hardware WebGPU adapter: the plan redraw during a scripted drag, the 3D update of each
reference edit, and 3D frames of each view and after each edit. Prints each time beside its budget
and the baseline. Times are reported, never gated. Keep the window visible and in front.

  --quick            divide every sample count by 10 (at least 10): a check, not a measurement
  --out <path>       write the run file here (default: node_modules/.cache/performance-timing/)
  --baseline <path>  compare with this run file (default: tests/performance/baseline-times.json)
  --write-baseline   also write the run as tests/performance/baseline-times.json
  --help             print this text

Paths are relative to the repository root. Exit codes: 0 measured. 2 nothing was measured (each
reason is printed and nothing is written), or the run was measured but its baseline write was
refused (each reason is printed; the run file is written, the baseline is not). 1 an error, such
as an unknown flag, a --baseline file that does not exist, or a failed build.`

/** @param {string[]} args */
function git(args) {
  return execFileSync('git', args, { cwd: REPOSITORY_ROOT, encoding: 'utf8' }).trim()
}

function hasUncommittedChanges() {
  return git(['status', '--porcelain', '--untracked-files=no']) !== ''
}

/**
 * What only Node knows: the commit, whether tracked files changed, and the machine.
 * @param {string} browser the name and version of the browser
 * @returns {HostDescription}
 */
export function describeHost(browser) {
  const processors = os.cpus()
  return {
    commit: git(['rev-parse', 'HEAD']),
    uncommittedChanges: hasUncommittedChanges(),
    processor: processors[0]?.model ?? 'unknown',
    logicalCores: processors.length,
    memoryGiB: Math.round(os.totalmem() / BYTES_PER_GIB),
    operatingSystem: `${os.type()} ${os.release()} (${os.arch()})`,
    browser,
  }
}

/** @param {string} relativePath */
function fromRoot(relativePath) {
  return path.resolve(REPOSITORY_ROOT, relativePath)
}

/**
 * The text of the baseline file, null when the default file does not exist yet, or the reason it
 * cannot be used with the exit code for it. A path given with --baseline must exist (exit 1); an
 * unreadable or invalid file refuses the run (exit 2). Checked before the build and the browser.
 * @param {string} baselinePath
 * @param {boolean} [given] true when the path came from --baseline
 * @returns {Promise<{ ok: true, text: string | null } | { ok: false, reason: string, exitCode: number }>}
 */
export async function readBaseline(baselinePath, given = false) {
  let text
  try {
    text = await readFile(fromRoot(baselinePath), 'utf8')
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      const reason = `The baseline file ${baselinePath} cannot be read: ${error}`
      return { ok: false, reason, exitCode: EXIT_NOT_MEASURED }
    }
    if (!given) return { ok: true, text: null }
    const reason = `The baseline file ${fromRoot(baselinePath)} given with --baseline does not exist.`
    return { ok: false, reason, exitCode: EXIT_ERROR }
  }
  try {
    parseTimingRun(JSON.parse(text))
  } catch (error) {
    const detail = errorMessage(error)
    const reason = `The baseline file ${baselinePath} is not a valid timing record: ${detail}`
    return { ok: false, reason, exitCode: EXIT_NOT_MEASURED }
  }
  return { ok: true, text }
}

/** Builds the timing page with Vite in production mode, outside the app build. */
export async function buildTimingPage() {
  await build({
    configFile: false,
    root: PAGE_ROOT,
    mode: 'production',
    logLevel: 'warn',
    publicDir: false,
    plugins: [react()],
    build: {
      outDir: PAGE_OUT_DIRECTORY,
      emptyOutDir: true,
      reportCompressedSize: false,
      chunkSizeWarningLimit: PAGE_CHUNK_WARNING_KIB,
    },
  })
  return PAGE_OUT_DIRECTORY
}

/**
 * Serves the built page on 127.0.0.1, cross-origin isolated, on a free port.
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export async function serveTimingPage() {
  const server = await preview({
    configFile: false,
    root: PAGE_ROOT,
    logLevel: 'warn',
    build: { outDir: PAGE_OUT_DIRECTORY },
    preview: { host: '127.0.0.1', port: 0, open: false, headers: CROSS_ORIGIN_ISOLATION_HEADERS },
  })
  const url = server.resolvedUrls?.local[0]
  if (url === undefined) throw new Error('The timing page server has no local address')
  return { url, close: () => server.close() }
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

/**
 * Opens the page in a context with the window's own size and pixel ratio and brings it to front.
 * The page's warnings, errors, and uncaught errors are collected from before it loads.
 * @param {import('@playwright/test').Browser} browser
 * @param {string} url
 * @returns {Promise<{ page: import('@playwright/test').Page, messages: PageMessage[] }>}
 */
export async function openTimingPage(browser, url) {
  const context = await browser.newContext({ viewport: null })
  const page = await context.newPage()
  /** @type {PageMessage[]} */
  const messages = []
  page.on('console', (message) => messages.push({ type: message.type(), text: message.text() }))
  page.on('pageerror', (error) => messages.push({ type: 'pageerror', text: String(error) }))
  await page.goto(url)
  await page.bringToFront()
  await page.waitForFunction(() => typeof window.vernacularTiming === 'function')
  return { page, messages }
}

/**
 * Runs every phase with one call into the page. A rejection of the page (no frame, a failed live
 * view) becomes a refusal with its message, and so does a page that has not answered in time.
 * @param {import('@playwright/test').Page} page
 * @param {TimingInput} input
 * @param {number} [limitMs]
 * @returns {Promise<TimingOutcome>}
 */
export async function runTimingPage(page, input, limitMs = RUN_LIMIT_MS) {
  let timer
  const overdue = new Promise((resolve) => {
    const minutes = limitMs / MILLISECONDS_PER_MINUTE
    const reason = `The timing page did not finish within ${minutes} minutes, so nothing was measured.`
    timer = setTimeout(() => resolve({ kind: 'refused', reasons: [reason] }), limitMs)
  })
  const run = page
    .evaluate((pageInput) => window.vernacularTiming(pageInput), input)
    .catch((error) => {
      const detail = errorMessage(error)
      return { kind: 'refused', reasons: [`The timing page could not measure: ${detail}`] }
    })
  try {
    return await Promise.race([run, overdue])
  } finally {
    clearTimeout(timer)
  }
}

/** @param {Date} date */
function compactLocalTime(date) {
  /** @param {number} value */
  const pad = (value) => String(value).padStart(2, '0')
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
  return `${day}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

/**
 * The path of the run file: the --out path, or a new name in the cache folder.
 * @param {string | null} out
 * @param {string} commit
 */
export function runFilePath(out, commit) {
  if (out !== null) return fromRoot(out)
  const name = `run-${commit.slice(0, COMMIT_PREFIX_LENGTH)}-${compactLocalTime(new Date())}.json`
  return path.join(CACHE_DIRECTORY, name)
}

/** @param {string} filePath @param {string} text */
async function writeText(filePath, text) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, text)
}

/**
 * Prints the report and keeps the run: the run file always, the baseline on --write-baseline
 * unless the run may not become one. Returns the exit code.
 * @param {Extract<TimingOutcome, { kind: 'measured' }>} outcome
 * @param {TimingOptions} options
 * @param {string[]} [consoleLines] the "Console" part, printed below the report
 */
export async function keepMeasuredRun(outcome, options, consoleLines = []) {
  console.log(outcome.report)
  if (consoleLines.length > 0) console.log(consoleLines.join('\n'))
  const runFile = runFilePath(options.out, outcome.run.commit)
  await writeText(runFile, outcome.recordText)
  console.log(`Run file: ${path.relative(REPOSITORY_ROOT, runFile)}`)
  if (!options.writeBaseline) return EXIT_MEASURED
  const refusals = baselineWriteRefusals(outcome.run)
  if (refusals.length > 0) return printRefusals('The baseline was not written.', refusals)
  await writeText(BASELINE_FILE, serializeTimingRun(outcome.run))
  console.log(`Baseline written: ${path.relative(REPOSITORY_ROOT, BASELINE_FILE)}`)
  return EXIT_MEASURED
}

/**
 * The text of a thrown value.
 * @param {unknown} error
 */
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

/** @param {string} heading @param {string[]} reasons */
function printRefusals(heading, reasons) {
  console.error(heading)
  for (const reason of reasons) console.error(`- ${reason}`)
  return EXIT_NOT_MEASURED
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

/**
 * Builds, serves, launches, and runs; closes the browser and then the server however it ends.
 * @param {{ quick: boolean, baselineText: string | null, headless?: boolean }} run
 * @returns {Promise<{ outcome: TimingOutcome, consoleLines: string[] }>}
 */
export async function measureInBrowser({ quick, baselineText, headless = false }) {
  await buildTimingPage()
  const server = await serveTimingPage()
  let browser
  try {
    browser = await launchTimingBrowser(headless)
    const { page, messages } = await openTimingPage(browser, server.url)
    const host = describeHost(`Chromium ${browser.version()}`)
    const outcome = await runTimingPage(page, { quick, baselineText, host })
    return judgeConsole(outcome, messages)
  } finally {
    try {
      if (browser !== undefined) await closeBrowser(browser)
    } finally {
      await server.close()
    }
  }
}

/**
 * The reason a --write-baseline run cannot become the baseline that Node knows before the run:
 * uncommitted changes. The power source is known only in the page.
 * @param {TimingOptions} options
 * @returns {string | null}
 */
export function earlyBaselineRefusal(options) {
  if (!options.writeBaseline || !hasUncommittedChanges()) return null
  return (
    'The working tree has uncommitted changes, so this run could not become the baseline. ' +
    'Commit or discard the changes, or run without --write-baseline.'
  )
}

/**
 * The whole command. Returns the exit code.
 * @param {string[]} argv
 */
export async function main(argv) {
  const parsed = parseTimingArguments(argv)
  if (!parsed.ok) {
    console.error(parsed.message)
    return EXIT_ERROR
  }
  const { options } = parsed
  if (options.help) {
    console.log(USAGE)
    return EXIT_MEASURED
  }
  const baseline = await readBaseline(options.baseline, options.baselineGiven)
  if (!baseline.ok) {
    printRefusals('Nothing was measured.', [baseline.reason])
    return baseline.exitCode
  }
  const early = earlyBaselineRefusal(options)
  if (early !== null) return printRefusals('Nothing was measured.', [early])
  const measured = await measureInBrowser({ quick: options.quick, baselineText: baseline.text })
  const { outcome, consoleLines } = measured
  if (outcome.kind === 'measured') return keepMeasuredRun(outcome, options, consoleLines)
  console.error(consoleLines.join('\n'))
  return printRefusals('Nothing was measured.', outcome.reasons)
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code
      // A browser that never reported its close keeps its pipes open; end the process anyway.
      setTimeout(() => process.exit(code), EXIT_DELAY_MS).unref()
    },
    (error) => {
      console.error(error instanceof Error ? (error.stack ?? error.message) : error)
      process.exitCode = EXIT_ERROR
      // As after a run: a leftover handle must not keep the command alive after an error.
      setTimeout(() => process.exit(EXIT_ERROR), EXIT_DELAY_MS).unref()
    },
  )
}
