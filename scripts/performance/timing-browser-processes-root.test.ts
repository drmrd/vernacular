import { describe, expect, it } from 'vitest'

import {
  browserInstallRoot,
  crashHandlerPids,
  newPids,
  parseProcessList,
  stillCrashHandlers,
} from './timing-browser-processes.mjs'
import {
  BROWSER_PID,
  BROWSER_ROOT,
  EDITOR_HANDLER_PID,
  FIRST_HANDLER_PID,
  OLDER_HANDLER_PID,
  OTHER_BROWSER_HANDLER_PID,
  OTHER_PROGRAM_ROWS,
  SECOND_HANDLER_PID,
  processes,
} from './timing-browser-processes-fixture'

// Other programs built on the same browser engine also run a `chrome_crashpad_handler` with parent
// process id 1. The driver must only accept the handlers that lie inside the folder of the test
// browser that it launched.

const LINUX_ROOT = '/home/tester/.cache/ms-playwright/chromium-1223/chrome-linux'
const LINUX_PROCESSES = parseProcessList(`
 7001  7000 ${LINUX_ROOT}/chrome --remote-debugging-pipe --no-first-run about:blank
 7010     1 ${LINUX_ROOT}/chrome_crashpad_handler --monitor-self --handshake-fd=5
 7011     1 /opt/other/chrome_crashpad_handler --monitor-self
`)

const withOtherPrograms = [...processes, ...OTHER_PROGRAM_ROWS]

describe('the folder that holds the timing browser', () => {
  it('is the application bundle for a browser that is a macOS application', () => {
    expect(browserInstallRoot(processes, BROWSER_PID)).toBe(BROWSER_ROOT)
  })

  it('is the directory of the executable for a browser in another layout', () => {
    expect(browserInstallRoot(LINUX_PROCESSES, 7001)).toBe(LINUX_ROOT)
  })

  it('is undefined for an id that is not in the list', () => {
    expect(browserInstallRoot(processes, 777777)).toBeUndefined()
  })

  it('is undefined when the main process id is undefined', () => {
    expect(browserInstallRoot(processes, undefined)).toBeUndefined()
  })

  it('is undefined for an executable that sits directly under the file system root', () => {
    const list = parseProcessList(' 8001  8000 /chrome --remote-debugging-pipe --no-first-run')

    expect(browserInstallRoot(list, 8001)).toBeUndefined()
  })

  it('is undefined for an executable that has no folder at all', () => {
    const list = parseProcessList(' 8002  8000 chrome --remote-debugging-pipe')

    expect(browserInstallRoot(list, 8002)).toBeUndefined()
  })
})

describe('a folder that cannot be a browser folder', () => {
  const handlers = [
    { pid: 21, ppid: 1, command: '/opt/other/chrome_crashpad_handler --monitor-self' },
    { pid: 22, ppid: 1, command: '/chrome_crashpad_handler' },
  ]

  it('stops nothing when the folder is empty', () => {
    expect(crashHandlerPids(handlers, '')).toEqual([])
    expect(stillCrashHandlers([21, 22], handlers, '')).toEqual([])
  })

  it('stops nothing when the folder is the file system root', () => {
    expect(crashHandlerPids(handlers, '/')).toEqual([])
  })
})

describe('the crash handlers inside the folder of the timing browser', () => {
  it('finds the two helpers of the test browser', () => {
    expect(crashHandlerPids(processes, BROWSER_ROOT)).toEqual([
      FIRST_HANDLER_PID,
      SECOND_HANDLER_PID,
      OLDER_HANDLER_PID,
    ])
  })

  it('does not find the crash handler of another program with the parent id 1', () => {
    const found = crashHandlerPids(withOtherPrograms, BROWSER_ROOT)

    expect(found).not.toContain(OTHER_BROWSER_HANDLER_PID)
    expect(found).not.toContain(EDITOR_HANDLER_PID)
  })

  it('does not find a handler in a folder whose name only starts like the root', () => {
    const lookalike = [
      {
        pid: 9,
        ppid: 1,
        command: '/a/Test Browser.app.backup/Contents/Helpers/chrome_crashpad_handler --x',
      },
      { pid: 10, ppid: 1, command: '/a/Test Browser.app/Contents/Helpers/chrome_crashpad_handler' },
    ]

    expect(crashHandlerPids(lookalike, '/a/Test Browser.app')).toEqual([10])
  })

  it('finds a helper under the root of a browser in another layout', () => {
    expect(crashHandlerPids(LINUX_PROCESSES, LINUX_ROOT)).toEqual([7010])
  })

  it('finds nothing when the folder of the browser is not known', () => {
    expect(crashHandlerPids(processes, undefined)).toEqual([])
  })
})

describe('the helpers that are still crash handlers of the timing browser', () => {
  it('drops an id that now belongs to the crash handler of another program', () => {
    const ids = [FIRST_HANDLER_PID, OTHER_BROWSER_HANDLER_PID, EDITOR_HANDLER_PID]

    expect(stillCrashHandlers(ids, withOtherPrograms, BROWSER_ROOT)).toEqual([FIRST_HANDLER_PID])
  })

  it('gives nothing when the folder of the browser is not known', () => {
    expect(stillCrashHandlers([FIRST_HANDLER_PID], processes, undefined)).toEqual([])
  })
})

describe('the helpers to stop after a launch', () => {
  it('are the two helpers of the browser, not a handler that another program started meanwhile', () => {
    const before = processes.filter(
      ({ pid }) => ![BROWSER_PID, FIRST_HANDLER_PID, SECOND_HANDLER_PID].includes(pid),
    )
    const after = [...processes, ...OTHER_PROGRAM_ROWS]
    const root = browserInstallRoot(after, BROWSER_PID)

    expect(newPids(crashHandlerPids(before, root), crashHandlerPids(after, root))).toEqual([
      FIRST_HANDLER_PID,
      SECOND_HANDLER_PID,
    ])
  })
})
