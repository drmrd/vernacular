import { execFileSync, spawnSync } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import { defaultDeps } from './policy-check.mjs'

vi.mock('node:child_process', () => {
  const execFileSync = vi.fn()
  const spawnSync = vi.fn()
  return { default: { execFileSync, spawnSync }, execFileSync, spawnSync }
})

const MEBIBYTE = 1024 * 1024
const MIN_GIT_OUTPUT_BYTES = 64 * MEBIBYTE

describe('defaultDeps runGit', () => {
  it('lets git print a pull request diff far larger than the default output limit', () => {
    vi.mocked(execFileSync).mockReturnValue('')
    defaultDeps().runGit(['status'])
    const [command, args, options] = /** @type {any[]} */ (vi.mocked(execFileSync).mock.calls[0])
    expect(command).toBe('git')
    expect(args).toEqual(['status'])
    expect(options?.maxBuffer ?? 0).toBeGreaterThanOrEqual(MIN_GIT_OUTPUT_BYTES)
  })
})

const BASE = 'origin/main'
const HEAD = 'abc123'

/** @param {Record<string, unknown>} result */
function stubCommitlint(result) {
  vi.mocked(spawnSync).mockReturnValue(/** @type {any} */ (result))
}

describe('defaultDeps runCommitlint', () => {
  it('runs commitlint through pnpm over the base to head range', () => {
    stubCommitlint({ status: 0, stdout: '', stderr: '' })
    defaultDeps().runCommitlint({ base: BASE, head: HEAD })
    expect(spawnSync).toHaveBeenLastCalledWith(
      'pnpm',
      ['exec', 'commitlint', '--from', BASE, '--to', HEAD],
      { encoding: 'utf8' },
    )
  })

  it('returns the exit status and the output with stdout before stderr', () => {
    stubCommitlint({ status: 1, stdout: 'out text\n', stderr: 'err text\n' })
    expect(defaultDeps().runCommitlint({ base: BASE, head: HEAD })).toEqual({
      status: 1,
      output: 'out text\nerr text\n',
    })
  })

  it('throws when commitlint never produced an exit status', () => {
    stubCommitlint({ status: null, stdout: '', stderr: '' })
    expect(() => defaultDeps().runCommitlint({ base: BASE, head: HEAD })).toThrow()
  })
})
