import { describe, expect, it } from 'vitest'

import { parseTimingArguments } from './timing-arguments.mjs'

// An argument error is a result, not a throw: the surface of parseTimingArguments returns
// { ok: false, message }, so the driver can print the message and exit with the error code.

const DEFAULT_BASELINE = 'tests/performance/baseline-times.json'

function optionsOf(argv: string[]) {
  const result = parseTimingArguments(argv)
  if (!result.ok) {
    throw new Error(`expected the arguments to parse, got the error: ${result.message}`)
  }
  return result.options
}

function messageOf(argv: string[]): string {
  const result = parseTimingArguments(argv)
  if (result.ok) {
    throw new Error('expected an argument error, but the arguments parsed')
  }
  return result.message
}

describe('the arguments of the timing command', () => {
  it('give the defaults when there are none', () => {
    expect(optionsOf([])).toEqual({
      baseline: DEFAULT_BASELINE,
      out: null,
      quick: false,
      writeBaseline: false,
      help: false,
    })
  })

  it('set the path of the run file with --out', () => {
    expect(optionsOf(['--out', 'a.json']).out).toBe('a.json')
  })

  it('set the path of the baseline to compare against with --baseline', () => {
    expect(optionsOf(['--baseline', 'b.json']).baseline).toBe('b.json')
  })

  it('ask for a quick check with --quick', () => {
    expect(optionsOf(['--quick']).quick).toBe(true)
  })

  it('ask for the baseline to be written with --write-baseline', () => {
    expect(optionsOf(['--write-baseline']).writeBaseline).toBe(true)
  })

  it('ask for the usage with --help', () => {
    expect(optionsOf(['--help']).help).toBe(true)
  })

  it('leave the other fields at their defaults when one flag is given', () => {
    expect(optionsOf(['--quick'])).toEqual({
      baseline: DEFAULT_BASELINE,
      out: null,
      quick: true,
      writeBaseline: false,
      help: false,
    })
  })
})

describe('the arguments of the timing command that cannot be honored', () => {
  it('refuse --quick together with --write-baseline, saying a quick run cannot become the baseline', () => {
    const message = messageOf(['--quick', '--write-baseline'])

    expect(message.toLowerCase()).toContain('quick run cannot become the baseline')
  })

  it('refuse a flag that does not exist, naming it', () => {
    expect(messageOf(['--turbo'])).toContain('--turbo')
  })

  it('refuse --out with no value, naming the flag', () => {
    expect(messageOf(['--out'])).toContain('--out')
  })

  it('refuse --baseline with no value, naming the flag', () => {
    expect(messageOf(['--baseline'])).toContain('--baseline')
  })
})
