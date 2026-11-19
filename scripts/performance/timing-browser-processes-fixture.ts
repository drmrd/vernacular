import { parseProcessList } from './timing-browser-processes.mjs'

// A listing of `ps -Ao pid=,ppid=,command=` as the timing driver sees it on macOS: the driver, its
// browser, the browser's two crash handler helpers (parent process id 1), and unrelated processes.

export const DRIVER_PID = 52339
export const BROWSER_PID = 52375
export const FIRST_HANDLER_PID = 52388
export const SECOND_HANDLER_PID = 52392
export const OLDER_HANDLER_PID = 41001

export const CACHE = '/Users/tester/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64'
export const BROWSER_ROOT = `${CACHE}/Google Chrome for Testing.app`
const APP = `${BROWSER_ROOT}/Contents`
export const HANDLER = `${APP}/Frameworks/Google Chrome for Testing Framework.framework/Versions/148.0.7778.96/Helpers/chrome_crashpad_handler`
const GPU_HELPER = `${APP}/Frameworks/Google Chrome for Testing Framework.framework/Versions/148.0.7778.96/Helpers/Google Chrome for Testing Helper (GPU).app/Contents/MacOS/Google Chrome for Testing Helper (GPU)`
export const BROWSER = `${APP}/MacOS/Google Chrome for Testing`
const DATABASE =
  '--database=/Users/tester/Library/Application Support/Google/Chrome for Testing/Crashpad'

const PID_COLUMN_WIDTH = 5
const pad = (pid: number): string => String(pid).padStart(PID_COLUMN_WIDTH)

export const PROCESS_LIST = `
${pad(BROWSER_PID)} ${DRIVER_PID} ${BROWSER} --disable-field-trial-config --no-first-run --remote-debugging-pipe --user-data-dir=/var/folders/zz/T/playwright_chromiumdev_profile-AbCdEf about:blank
${pad(FIRST_HANDLER_PID)}     1 ${HANDLER} --monitor-self --monitor-self-annotation=ptype=crashpad-handler ${DATABASE} --annotation=plat=OS X --handshake-fd=7
${pad(SECOND_HANDLER_PID)}     1 ${HANDLER} --no-periodic-tasks --monitor-self-annotation=ptype=crashpad-handler ${DATABASE} --handshake-fd=4
52407 ${BROWSER_PID} ${GPU_HELPER} --type=gpu-process
${DRIVER_PID} 52001 node /Users/tester/workspace/project/scripts/performance/report-times.mjs --quick
  411     1 /usr/libexec/logd
${OLDER_HANDLER_PID}     1 ${HANDLER} --monitor-self --handshake-fd=7
52500 ${BROWSER_PID} ${HANDLER} --handshake-fd=9
53000 52001 grep chrome_crashpad_handler
53010     1 /usr/bin/helper-tool --watch=${CACHE}/chrome_crashpad_handler
52350 ${DRIVER_PID} /bin/zsh -c pnpm preview
61000 60999 ${BROWSER} --no-first-run --remote-debugging-pipe about:blank
`

export const processes = parseProcessList(PROCESS_LIST)

// Crash handlers of other programs that are built on the same browser engine.
export const OTHER_BROWSER_HANDLER_PID = 60101
export const EDITOR_HANDLER_PID = 60102

export const OTHER_BROWSER_HANDLER =
  '/Applications/Other Browser.app/Contents/Frameworks/Other Browser Framework.framework/Versions/1.0/Helpers/chrome_crashpad_handler --database=/x'
export const EDITOR_HANDLER =
  '/Applications/Some Editor.app/Contents/Frameworks/Some Editor Framework.framework/Helpers/chrome_crashpad_handler --no-rate-limit'

export const OTHER_PROGRAM_ROWS = [
  { pid: OTHER_BROWSER_HANDLER_PID, ppid: 1, command: OTHER_BROWSER_HANDLER },
  { pid: EDITOR_HANDLER_PID, ppid: 1, command: EDITOR_HANDLER },
]
