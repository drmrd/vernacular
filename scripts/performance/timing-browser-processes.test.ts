import { describe, expect, it } from 'vitest'

import {
  browserMainPid,
  crashHandlerPids,
  newPids,
  parseProcessList,
  stillCrashHandlers,
} from './timing-browser-processes.mjs'
import {
  BROWSER,
  BROWSER_PID,
  BROWSER_ROOT,
  DRIVER_PID,
  FIRST_HANDLER_PID,
  OLDER_HANDLER_PID,
  SECOND_HANDLER_PID,
  processes,
} from './timing-browser-processes-fixture'

// The timing browser leaves its two crash handler helpers behind: they are double-forked (parent
// process id 1), they name nothing of their browser, and they keep the browser's error channel
// open. The driver tells its own helpers by time (new after its launch) and by what they still
// are. These functions read a listing of `ps -Ao pid=,ppid=,command=` and hold no process access.

const pidsOf = (list: { pid: number }[]): number[] => list.map(({ pid }) => pid)

describe('the parsing of a process listing', () => {
  it('reads the process id, the parent id, and the whole command of each line, in order', () => {
    const listing = parseProcessList(
      `  411     1 /usr/libexec/logd\n52339 52001 node report-times.mjs --quick\n`,
    )

    expect(listing).toEqual([
      { pid: 411, ppid: 1, command: '/usr/libexec/logd' },
      { pid: 52339, ppid: 52001, command: 'node report-times.mjs --quick' },
    ])
  })

  it('keeps the spaces inside the command of a path that holds spaces', () => {
    const browser = processes.find(({ pid }) => pid === BROWSER_PID)

    expect(browser?.ppid).toBe(DRIVER_PID)
    expect(browser?.command.startsWith(`${BROWSER} --disable-field-trial-config`)).toBe(true)
    expect(browser?.command.endsWith('about:blank')).toBe(true)
  })

  it.each([
    ['an empty text', ''],
    ['blank lines', '\n   \n\n'],
    ['a header line', 'PID PPID COMMAND'],
    ['a line with only one number', '123'],
    ['a line that starts with a number and then a word', '123 abc /bin/sh'],
  ])('gives no process for %s', (_label, text) => {
    expect(parseProcessList(text)).toEqual([])
  })

  it('skips the lines that are not processes and keeps the ones around them', () => {
    const listing = parseProcessList('PID PPID COMMAND\n 7 1 /sbin/a\n\n 8 7 /sbin/b --x\n')

    expect(pidsOf(listing)).toEqual([7, 8])
  })
})

describe('the crash handlers in a process listing', () => {
  it('finds the processes that have the parent id 1 and an executable named chrome_crashpad_handler', () => {
    expect(crashHandlerPids(processes, BROWSER_ROOT)).toEqual([
      FIRST_HANDLER_PID,
      SECOND_HANDLER_PID,
      OLDER_HANDLER_PID,
    ])
  })

  it('does not include a process of that name under another parent', () => {
    expect(crashHandlerPids(processes, BROWSER_ROOT)).not.toContain(52500)
  })

  it.each([
    ['a command that only searches for the name', 53000],
    ['a process under the parent 1 whose arguments only mention the name', 53010],
  ])('does not include %s', (_label, pid) => {
    expect(crashHandlerPids(processes, BROWSER_ROOT)).not.toContain(pid)
  })

  it('finds a crash handler that has no arguments', () => {
    const bare = [{ pid: 9, ppid: 1, command: '/opt/x/chrome_crashpad_handler' }]

    expect(crashHandlerPids(bare, '/opt/x')).toEqual([9])
  })

  it('does not include an unrelated process under the parent 1', () => {
    expect(crashHandlerPids(processes, BROWSER_ROOT)).not.toContain(411)
  })

  it('finds nothing in an empty listing', () => {
    expect(crashHandlerPids([], BROWSER_ROOT)).toEqual([])
  })
})

describe('the ids that are new after a launch', () => {
  it('keeps the ids of after that are not in before, in the order of after', () => {
    expect(newPids([5, 1], [9, 1, 7, 5, 3])).toEqual([9, 7, 3])
  })

  it('leaves out a crash handler of another browser that existed before the launch', () => {
    const before = crashHandlerPids(
      processes.filter(({ pid }) => pid !== FIRST_HANDLER_PID && pid !== SECOND_HANDLER_PID),
      BROWSER_ROOT,
    )
    const after = crashHandlerPids(processes, BROWSER_ROOT)

    expect(newPids(before, after)).toEqual([FIRST_HANDLER_PID, SECOND_HANDLER_PID])
  })

  it.each([
    ['nothing before and nothing after', { before: [], after: [], expected: [] }],
    ['nothing before', { before: [], after: [4, 2], expected: [4, 2] }],
    ['the same ids before and after', { before: [4, 2], after: [4, 2], expected: [] }],
    ['nothing after', { before: [4, 2], after: [], expected: [] }],
  ])('gives the right ids for %s', (_label, { before, after, expected }) => {
    expect(newPids(before, after)).toEqual(expected)
  })
})

describe('the main process of the timing browser', () => {
  it('is the child of the driver that has the argument --remote-debugging-pipe', () => {
    expect(browserMainPid(processes, DRIVER_PID)).toBe(BROWSER_PID)
  })

  it('is not a process with that argument under another parent', () => {
    expect(browserMainPid(processes, 60999)).toBe(61000)
    expect(browserMainPid(processes, DRIVER_PID)).not.toBe(61000)
  })

  it('is not a child of the driver that lacks the argument, such as a shell', () => {
    const withoutBrowser = processes.filter(({ pid }) => pid !== BROWSER_PID)

    expect(browserMainPid(withoutBrowser, DRIVER_PID)).toBeUndefined()
  })

  it('is undefined for a driver without any child', () => {
    expect(browserMainPid(processes, 1234567)).toBeUndefined()
    expect(browserMainPid([], DRIVER_PID)).toBeUndefined()
  })
})

describe('the helpers that are still crash handlers', () => {
  it('keeps the given ids that are crash handlers now', () => {
    expect(
      stillCrashHandlers([FIRST_HANDLER_PID, SECOND_HANDLER_PID], processes, BROWSER_ROOT),
    ).toEqual([FIRST_HANDLER_PID, SECOND_HANDLER_PID])
  })

  it('drops an id whose process has gone', () => {
    expect(stillCrashHandlers([FIRST_HANDLER_PID, 777777], processes, BROWSER_ROOT)).toEqual([
      FIRST_HANDLER_PID,
    ])
  })

  it('drops an id that the system gave to another program meanwhile', () => {
    expect(stillCrashHandlers([FIRST_HANDLER_PID, 411, 53010], processes, BROWSER_ROOT)).toEqual([
      FIRST_HANDLER_PID,
    ])
  })

  it('gives nothing for no ids', () => {
    expect(stillCrashHandlers([], processes, BROWSER_ROOT)).toEqual([])
  })
})
