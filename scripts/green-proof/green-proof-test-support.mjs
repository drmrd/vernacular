/** @typedef {import('./worktree.mjs').CommandResult} CommandResult */

/**
 * A fake `runGit` that records each call's argv in `calls`.
 * `rev-parse <sha>:pnpm-lock.yaml` answers `blobs[sha]` plus a newline; every other call answers ''.
 * A call throws an Error when its argv joined with spaces contains any string of `failOn`.
 * @param {{ blobs?: Record<string, string>, failOn?: readonly string[] }} [answers]
 * @returns {((args: readonly string[]) => string) & { calls: string[][] }}
 */
export function fakeGit(answers = {}) {
  const { blobs = {}, failOn = [] } = answers
  const calls = []
  const runGit = (args) => {
    calls.push([...args])
    const line = args.join(' ')
    if (failOn.some((needle) => line.includes(needle))) {
      throw new Error(`fake git failed: ${line}`)
    }
    if (args[0] === 'rev-parse') {
      const sha = args[1].split(':')[0]
      return `${blobs[sha] ?? 'blob-default'}\n`
    }
    return ''
  }
  return Object.assign(runGit, { calls })
}

/**
 * A fake `runCommand` that records `{ command, args, options }` in `calls`.
 * Each call takes the next entry of `results` (missing fields default to a clean exit).
 * @param {{ results?: readonly Partial<CommandResult>[] }} [answers]
 */
export function fakeRunner(answers = {}) {
  const { results = [] } = answers
  const calls = []
  const runCommand = (command, args, options) => {
    const next = results[calls.length] ?? {}
    calls.push({ command, args: [...args], options })
    return { status: 0, stdout: '', stderr: '', ...next }
  }
  return Object.assign(runCommand, { calls })
}

/**
 * An in-memory `Files`. `makeTempDir` answers `/fake-tmp/<prefix><n>`; `removed` lists removed folders.
 */
export function fakeFiles() {
  const contents = new Map()
  const madeDirs = []
  const removed = []
  return {
    madeDirs,
    removed,
    readFile(path) {
      if (!contents.has(path)) throw new Error(`no such file: ${path}`)
      return contents.get(path)
    },
    writeFile(path, text) {
      contents.set(path, text)
    },
    makeTempDir(prefix) {
      const dir = `/fake-tmp/${prefix}${madeDirs.length + 1}`
      madeDirs.push(dir)
      return dir
    },
    removeDir(path) {
      removed.push(path)
    },
  }
}
