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
import { timingLaunchArgs } from './timing-launch.mjs'

/** @typedef {import('./timing-arguments.mjs').TimingOptions} TimingOptions */
/** @typedef {import('../../tests/performance/timing/run-timing.ts').HostDescription} HostDescription */
/** @typedef {import('../../tests/performance/timing/run-timing.ts').TimingInput} TimingInput */
/** @typedef {import('../../tests/performance/timing/run-timing.ts').TimingOutcome} TimingOutcome */

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

Paths are relative to the repository root. Exit codes: 0 measured; 2 refused or could not
measure (each reason is printed, nothing is written); 1 an error.`

/** @param {string[]} args */
function git(args) {
  return execFileSync('git', args, { cwd: REPOSITORY_ROOT, encoding: 'utf8' }).trim()
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
    uncommittedChanges: git(['status', '--porcelain', '--untracked-files=no']) !== '',
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
 * The text of the baseline file, null when there is none, or the reason it cannot be used. The
 * file is checked here, before any browser opens.
 * @param {string} baselinePath
 * @returns {Promise<{ ok: true, text: string | null } | { ok: false, reason: string }>}
 */
export async function readBaseline(baselinePath) {
  let text
  try {
    text = await readFile(fromRoot(baselinePath), 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return { ok: true, text: null }
    return { ok: false, reason: `The baseline file ${baselinePath} cannot be read: ${error}` }
  }
  try {
    parseTimingRun(JSON.parse(text))
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      reason: `The baseline file ${baselinePath} is not a valid timing record: ${detail}`,
    }
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
 * Launches Chromium with the timing flags, the channel of the scene-webgl project.
 * @param {boolean} [headless] false (the default) opens a visible window, as a timing run needs
 */
export function launchTimingBrowser(headless = false) {
  return chromium.launch({
    channel: 'chromium',
    headless,
    args: timingLaunchArgs(process.platform),
  })
}

/**
 * Opens the page in a context with the window's own size and pixel ratio and brings it to front.
 * @param {import('@playwright/test').Browser} browser
 * @param {string} url
 */
export async function openTimingPage(browser, url) {
  const context = await browser.newContext({ viewport: null })
  const page = await context.newPage()
  await page.goto(url)
  await page.bringToFront()
  await page.waitForFunction(() => typeof window.vernacularTiming === 'function')
  return page
}

/**
 * Runs every phase with one call into the page. A rejection of the page (no frame, a failed live
 * view) becomes a refusal with its message.
 * @param {import('@playwright/test').Page} page
 * @param {TimingInput} input
 * @returns {Promise<TimingOutcome>}
 */
export async function runTimingPage(page, input) {
  try {
    return await page.evaluate((pageInput) => window.vernacularTiming(pageInput), input)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { kind: 'refused', reasons: [`The timing page could not measure: ${detail}`] }
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
 */
export async function keepMeasuredRun(outcome, options) {
  console.log(outcome.report)
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

/** @param {string} heading @param {string[]} reasons */
function printRefusals(heading, reasons) {
  console.error(heading)
  for (const reason of reasons) console.error(`- ${reason}`)
  return EXIT_NOT_MEASURED
}

/**
 * Builds, serves, launches, and runs; closes the browser and the server however it ends.
 * @param {{ quick: boolean, baselineText: string | null, headless?: boolean }} run
 * @returns {Promise<TimingOutcome>}
 */
export async function measureInBrowser({ quick, baselineText, headless = false }) {
  await buildTimingPage()
  const server = await serveTimingPage()
  let browser
  try {
    browser = await launchTimingBrowser(headless)
    const page = await openTimingPage(browser, server.url)
    const host = describeHost(`Chromium ${browser.version()}`)
    return await runTimingPage(page, { quick, baselineText, host })
  } finally {
    await browser?.close()
    await server.close()
  }
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
  const baseline = await readBaseline(options.baseline)
  if (!baseline.ok) return printRefusals('Nothing was measured.', [baseline.reason])
  const outcome = await measureInBrowser({ quick: options.quick, baselineText: baseline.text })
  if (outcome.kind === 'refused') return printRefusals('Nothing was measured.', outcome.reasons)
  return keepMeasuredRun(outcome, options)
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code
    },
    (error) => {
      console.error(error instanceof Error ? (error.stack ?? error.message) : error)
      process.exitCode = EXIT_ERROR
    },
  )
}
