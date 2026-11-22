// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const REPOSITORY_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const CHILD_TIMEOUT_MS = 20_000
const TEST_TIMEOUT_MS = 30_000

function importUnderPlainNode(scriptFileName) {
  const scriptUrl = pathToFileURL(fileURLToPath(new URL(scriptFileName, import.meta.url))).href
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', `await import(${JSON.stringify(scriptUrl)})`],
    {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      timeout: CHILD_TIMEOUT_MS,
      env: { ...process.env, NODE_OPTIONS: '' },
    },
  )
  return { status: result.status, error: result.error?.message, stderr: result.stderr }
}

describe('the pack command line tool under plain node', () => {
  it.each(['vernacular-pack.mjs', 'pack-integrity.mjs'])(
    'loads %s without a loader',
    (script) => {
      expect(importUnderPlainNode(script)).toEqual({
        status: 0,
        error: undefined,
        stderr: expect.not.stringContaining('ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX'),
      })
    },
    TEST_TIMEOUT_MS,
  )
})
