// The command-line arguments of `pnpm perf:report`. Pure: the driver passes
// process.argv.slice(2), and nothing is thrown.

const DEFAULT_BASELINE_PATH = 'tests/performance/baseline-times.json'

/**
 * @typedef {{
 *   writeBaseline: boolean,
 *   quick: boolean,
 *   out: string | null,
 *   baseline: string,
 *   baselineGiven: boolean,
 *   help: boolean,
 * }} TimingOptions
 */

/** @typedef {{ ok: true, options: TimingOptions } | { ok: false, message: string }} TimingArgumentsResult */

/**
 * @param {string} flag
 * @returns {{ ok: false, message: string }}
 */
function missingValue(flag) {
  return {
    ok: false,
    message: `The ${flag} flag needs a path after it, for example ${flag} run.json.`,
  }
}

/**
 * @param {string} flag
 * @returns {{ ok: false, message: string }}
 */
function unknownFlag(flag) {
  return {
    ok: false,
    message: `The flag ${flag} is not known. Use --out, --baseline, --quick, --write-baseline, or --help.`,
  }
}

/**
 * @param {string[]} argv
 * @param {number} index
 * @returns {string | null}
 */
function valueAfter(argv, index) {
  const value = argv[index + 1]
  return value === undefined || value.startsWith('--') ? null : value
}

/**
 * @param {string[]} argv
 * @returns {TimingArgumentsResult}
 */
export function parseTimingArguments(argv) {
  /** @type {TimingOptions} */
  const options = {
    writeBaseline: false,
    quick: false,
    out: null,
    baseline: DEFAULT_BASELINE_PATH,
    baselineGiven: false,
    help: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--quick') options.quick = true
    else if (flag === '--write-baseline') options.writeBaseline = true
    else if (flag === '--help') options.help = true
    else if (flag === '--out' || flag === '--baseline') {
      const value = valueAfter(argv, index)
      if (value === null) return missingValue(flag)
      if (flag === '--out') options.out = value
      else {
        options.baseline = value
        options.baselineGiven = true
      }
      index += 1
    } else return unknownFlag(flag)
  }
  if (options.quick && options.writeBaseline) {
    return {
      ok: false,
      message:
        'A quick run cannot become the baseline. Run again without --quick to use --write-baseline.',
    }
  }
  return { ok: true, options }
}
