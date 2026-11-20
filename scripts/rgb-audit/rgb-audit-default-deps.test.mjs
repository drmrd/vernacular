import { execFileSync } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
// The implementer adds this export: the real dependencies the CLI runs with.
import { defaultDeps } from './rgb-audit.mjs'

vi.mock('node:child_process', () => {
  const execFileSync = vi.fn()
  const spawnSync = vi.fn()
  return { default: { execFileSync, spawnSync }, execFileSync, spawnSync }
})

const MEBIBYTE = 1024 * 1024
const MIN_GIT_OUTPUT_BYTES = 64 * MEBIBYTE

describe('rgb-audit defaultDeps runGit', () => {
  it('lets git print a branch history far larger than the default output limit', () => {
    vi.mocked(execFileSync).mockReturnValue('')
    defaultDeps().runGit(['status'])
    const [command, args, options] = /** @type {any[]} */ (vi.mocked(execFileSync).mock.calls[0])
    expect(command).toBe('git')
    expect(args).toEqual(['status'])
    expect(options?.maxBuffer ?? 0).toBeGreaterThanOrEqual(MIN_GIT_OUTPUT_BYTES)
  })
})
