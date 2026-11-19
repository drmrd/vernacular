import { StrictMode } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSetting } from '../bridge'
import { createTestPorts } from '../session/handle/handle-test-kit'
import { SNAP_PREFERENCES_SETTING } from '../editor/plan/snap-preferences'
import { LocalStorageSettingsPort, type SettingsPort } from '../storage'
import {
  memoryStorage,
  NEW_SNAP_KEY,
  OLD_SNAP_KEY,
  type MemoryStorage,
} from '../storage/settings/settings-storage-test-kit'
import { stubEmptyBrowserStorage } from '../editor/design-system/browser-environment-test-support'
import {
  expectStoredWithGridOff,
  imitateBrowserStorage,
  OLDER_BUILD_SNAP_TEXT,
  WHOLE_APPLICATION_TIMEOUT_MS,
} from './app-settings-test-support'
import { AppSettings } from './app-settings'
import {
  chooseFromTheProjectMenu,
  expectOpenProject,
  findTheShell,
  NEW_PROJECT_NAME,
  plantProject,
  renderApp,
  START_ID,
  stubCapableStorage,
} from './app-test-support'

/** A text that an older build could not have written, and that is not JSON. */
const BROKEN_TEXT = 'not json {'

const HOUSE_NAME = 'Corner House'

const GRID_OFF_PROBE = 'grid off, radius 18'

// A case that imitates the browser storage does so after this stub, and replaces it.
beforeEach(() => {
  stubEmptyBrowserStorage()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Shows the snap preferences of the settings: the grid switch and the radius. */
function SnapProbe() {
  const [preferences] = useSetting(SNAP_PREFERENCES_SETTING)
  return <p>{`grid ${preferences.kinds.grid ? 'on' : 'off'}, radius ${preferences.pixelRadius}`}</p>
}

/** Starts the whole application over `settings`, with a project named `HOUSE_NAME` stored. */
async function startTheApplication(settings: SettingsPort): Promise<void> {
  stubCapableStorage()
  const ports = createTestPorts()
  await plantProject(ports, START_ID, HOUSE_NAME)
  renderApp(ports, { settings })
  await findTheShell()
  await expectOpenProject(HOUSE_NAME)
}

/** Opens the snap control of the status bar and gives its dialog. */
async function openTheSnapControl(): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole('button', { name: /snap/i }))
  return screen.findByRole('dialog', { name: /snapping precision/i })
}

/** Closes the snap control by its button, which is pressed while the dialog shows. */
async function closeTheSnapControl(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: /snap/i, expanded: true }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
}

describe('the first start of the snap preferences under strict mode', () => {
  it('carries the old preferences once: one write of the new key, one removal of the old key', () => {
    const { setItem, removeItem } = imitateBrowserStorage({ [OLD_SNAP_KEY]: OLDER_BUILD_SNAP_TEXT })

    render(
      <StrictMode>
        <AppSettings>
          <SnapProbe />
        </AppSettings>
      </StrictMode>,
    )

    expect(screen.getByText(GRID_OFF_PROBE)).toBeInTheDocument()
    expect(setItem.mock.calls).toEqual([[NEW_SNAP_KEY, OLDER_BUILD_SNAP_TEXT]])
    expect(removeItem.mock.calls).toEqual([[OLD_SNAP_KEY]])
  })

  it('keeps the old preferences in effect and the old key when the browser refuses the carry', () => {
    const { entries } = imitateBrowserStorage({ [OLD_SNAP_KEY]: OLDER_BUILD_SNAP_TEXT })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The storage refuses this call.', 'SecurityError')
    })

    render(
      <StrictMode>
        <AppSettings>
          <SnapProbe />
        </AppSettings>
      </StrictMode>,
    )

    expect(screen.getByText(GRID_OFF_PROBE)).toBeInTheDocument()
    expect(entries.get(OLD_SNAP_KEY)).toBe(OLDER_BUILD_SNAP_TEXT)
  })
})

describe('a second start of the application over the same browser storage', () => {
  it('shows the same preferences and writes and removes nothing', () => {
    const storage = memoryStorage({ [OLD_SNAP_KEY]: OLDER_BUILD_SNAP_TEXT })
    const first = render(
      <AppSettings port={new LocalStorageSettingsPort(storage)}>
        <SnapProbe />
      </AppSettings>,
    )
    expect(screen.getByText(GRID_OFF_PROBE)).toBeInTheDocument()
    first.unmount()

    const setItem = vi.spyOn(storage, 'setItem')
    const removeItem = vi.spyOn(storage, 'removeItem')
    const secondPort = new LocalStorageSettingsPort(storage)
    render(
      <AppSettings port={secondPort}>
        <SnapProbe />
      </AppSettings>,
    )

    expect(screen.getByText(GRID_OFF_PROBE)).toBeInTheDocument()
    expect(setItem).not.toHaveBeenCalled()
    expect(removeItem).not.toHaveBeenCalled()
  })
})

describe('the snap preferences across the life of the application', () => {
  it(
    'a snap change of this tab stays in effect after a new project is started',
    async () => {
      await startTheApplication(new LocalStorageSettingsPort(memoryStorage()))
      const first = await openTheSnapControl()
      await userEvent.click(within(first).getByRole('checkbox', { name: /grid/i }))
      expect(within(first).getByRole('checkbox', { name: /grid/i })).not.toBeChecked()
      await closeTheSnapControl()

      await chooseFromTheProjectMenu(/new project/i)
      await expectOpenProject(NEW_PROJECT_NAME)

      const second = await openTheSnapControl()
      expect(within(second).getByRole('checkbox', { name: /grid/i })).not.toBeChecked()
    },
    WHOLE_APPLICATION_TIMEOUT_MS,
  )

  it(
    'a stored text that is not JSON gives the defaults, is carried unchanged, and is replaced at the first change',
    async () => {
      const storage: MemoryStorage = memoryStorage({ [OLD_SNAP_KEY]: BROKEN_TEXT })
      await startTheApplication(new LocalStorageSettingsPort(storage))

      const control = await openTheSnapControl()

      expect(within(control).getByRole('checkbox', { name: /grid/i })).toBeChecked()
      expect(storage.entries.get(NEW_SNAP_KEY)).toBe(BROKEN_TEXT)
      expect(storage.entries.has(OLD_SNAP_KEY)).toBe(false)

      await userEvent.click(within(control).getByRole('checkbox', { name: /grid/i }))

      expectStoredWithGridOff(storage.entries)
    },
    WHOLE_APPLICATION_TIMEOUT_MS,
  )
})
