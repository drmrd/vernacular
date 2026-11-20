import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSetting } from '../bridge'
import type { SettingKey } from '../session'
import { createTestPorts } from '../session/handle/handle-test-kit'
import { InMemorySettingsPort, LocalStorageSettingsPort, type SettingsPort } from '../storage'
import {
  memoryStorage,
  NEW_SNAP_KEY,
  OLD_SNAP_KEY,
  refusing,
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
  renderApp,
  stubCapableStorage,
} from './app-test-support'

/** A setting of the test, with a text value. */
const NOTE: SettingKey<string> = {
  name: 'testNote',
  defaultValue: 'no note',
  parse: (raw) => (typeof raw === 'string' ? raw : undefined),
}

/** The key under which the browser keeps the note of the test. */
const NOTE_BROWSER_KEY = 'vernacular.settings.testNote'

const WRITTEN_NOTE = 'written by the probe'

/** The name under which the settings keep the theme choice. */
const THEME_NAME = 'theme'

/** The key under which the browser keeps the theme choice. */
const THEME_BROWSER_KEY = 'vernacular.settings.theme'

// A case that imitates the browser storage does so after this stub, and replaces it.
beforeEach(() => {
  stubEmptyBrowserStorage()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Shows the note of the settings, and writes a new note on a click. */
function NoteProbe() {
  const [note, setNote] = useSetting(NOTE)
  return (
    <button type="button" onClick={() => setNote(WRITTEN_NOTE)}>
      {note}
    </button>
  )
}

/** Starts the application on test ports with `settings`, and opens the snap control of the status bar. */
async function startAndOpenTheSnapControl(settings?: SettingsPort): Promise<HTMLElement> {
  stubCapableStorage()
  renderApp(createTestPorts(), settings === undefined ? {} : { settings })
  await findTheShell()
  await userEvent.click(screen.getByRole('button', { name: /snap/i }))
  return screen.findByRole('dialog', { name: /snapping precision/i })
}

/** The theme that the element with a `data-theme` attribute around the shell shows. */
function shellTheme(shell: HTMLElement): string | null | undefined {
  return shell.closest('[data-theme]')?.getAttribute('data-theme')
}

/** Chooses Dark in the theme toggle of the shell. */
async function chooseDark(): Promise<void> {
  const toggle = screen.getByRole('group', { name: /theme/i })
  await userEvent.click(within(toggle).getByRole('button', { name: /^dark$/i }))
}

describe('AppSettings', () => {
  it('gives the tree a settings service over the given port', async () => {
    const port = new InMemorySettingsPort()
    render(
      <AppSettings port={port}>
        <NoteProbe />
      </AppSettings>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'no note' }))

    expect(screen.getByRole('button', { name: WRITTEN_NOTE })).toBeInTheDocument()
    expect(port.read(NOTE.name)).toBe(WRITTEN_NOTE)
  })

  it('reads the settings of this browser when no port is given', () => {
    imitateBrowserStorage({ [NOTE_BROWSER_KEY]: JSON.stringify('kept by the browser') })

    render(
      <AppSettings>
        <NoteProbe />
      </AppSettings>,
    )

    expect(screen.getByRole('button', { name: 'kept by the browser' })).toBeInTheDocument()
  })

  it('keeps one service for the life of the mount', async () => {
    const first = new InMemorySettingsPort()
    first.write(NOTE.name, 'from the first port')
    const second = new InMemorySettingsPort()
    second.write(NOTE.name, 'from the second port')
    const { rerender } = render(
      <AppSettings port={first}>
        <NoteProbe />
      </AppSettings>,
    )

    rerender(
      <AppSettings port={second}>
        <NoteProbe />
      </AppSettings>,
    )
    expect(screen.getByRole('button', { name: 'from the first port' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'from the first port' }))
    expect(first.read(NOTE.name)).toBe(WRITTEN_NOTE)
    expect(second.read(NOTE.name)).toBe('from the second port')
  })
})

describe('the snap preferences of the application', () => {
  it('snap preferences that an older build stored are in effect in the application', async () => {
    const storage = memoryStorage({ [OLD_SNAP_KEY]: OLDER_BUILD_SNAP_TEXT })
    const settings = new LocalStorageSettingsPort(storage)

    const control = await startAndOpenTheSnapControl(settings)

    expect(within(control).getByRole('checkbox', { name: /grid/i })).not.toBeChecked()
    expect(within(control).getByRole('checkbox', { name: /endpoint/i })).toBeChecked()
    expect(storage.entries.get(NEW_SNAP_KEY)).toBe(OLDER_BUILD_SNAP_TEXT)
    expect(storage.entries.has(OLD_SNAP_KEY)).toBe(false)
  })

  it('snap preferences that an older build stored in this browser are in effect at the first start', async () => {
    const { entries } = imitateBrowserStorage({ [OLD_SNAP_KEY]: OLDER_BUILD_SNAP_TEXT })

    const control = await startAndOpenTheSnapControl()

    expect(within(control).getByRole('checkbox', { name: /grid/i })).not.toBeChecked()
    expect(within(control).getByRole('checkbox', { name: /endpoint/i })).toBeChecked()
    expect(entries.get(NEW_SNAP_KEY)).toBe(OLDER_BUILD_SNAP_TEXT)
    expect(entries.has(OLD_SNAP_KEY)).toBe(false)
  })

  it('a snap change in the application reaches the port', async () => {
    const storage = memoryStorage()
    const control = await startAndOpenTheSnapControl(new LocalStorageSettingsPort(storage))

    await userEvent.click(within(control).getByRole('checkbox', { name: /grid/i }))

    expectStoredWithGridOff(storage.entries)
    expect(storage.entries.has(OLD_SNAP_KEY)).toBe(false)
  })

  it('a snap change stays in effect when the browser refuses to store it', async () => {
    const storage = memoryStorage()
    const settings = new LocalStorageSettingsPort(refusing(storage, ['setItem', 'removeItem']))
    const control = await startAndOpenTheSnapControl(settings)

    await userEvent.click(within(control).getByRole('checkbox', { name: /grid/i }))

    expect(within(control).getByRole('checkbox', { name: /grid/i })).not.toBeChecked()
    expect(storage.entries.size).toBe(0)
  })
})

describe('the theme of the application', () => {
  it(
    'a theme choice is in effect after a new mount over the same port',
    async () => {
      const port = new InMemorySettingsPort()
      stubCapableStorage()
      const first = renderApp(createTestPorts(), { settings: port })
      await findTheShell()
      await chooseDark()
      first.unmount()

      renderApp(createTestPorts(), { settings: port })
      const shell = await findTheShell()

      expect(shellTheme(shell)).toBe('dark')
    },
    WHOLE_APPLICATION_TIMEOUT_MS,
  )

  it(
    'the shell starts in the stored theme',
    async () => {
      const port = new InMemorySettingsPort()
      port.write(THEME_NAME, 'dark')
      stubCapableStorage()

      renderApp(createTestPorts(), { settings: port })
      const shell = await findTheShell()

      expect(shellTheme(shell)).toBe('dark')
    },
    WHOLE_APPLICATION_TIMEOUT_MS,
  )

  it(
    'the dark theme stays on the same themed element after a new project is started',
    async () => {
      stubCapableStorage()
      renderApp(createTestPorts(), { settings: new InMemorySettingsPort() })
      const shellBefore = await findTheShell()
      await chooseDark()
      const wrapperBefore = shellBefore.closest('[data-theme]')
      expect(wrapperBefore).not.toBeNull()

      await chooseFromTheProjectMenu(/new project/i)
      await expectOpenProject(NEW_PROJECT_NAME)

      const shellAfter = await findTheShell()
      expect(shellTheme(shellAfter)).toBe('dark')
      expect(shellAfter.closest('[data-theme]')).toBe(wrapperBefore)
    },
    WHOLE_APPLICATION_TIMEOUT_MS,
  )

  it(
    'with no port given the application takes the theme that this browser stores',
    async () => {
      imitateBrowserStorage({ [THEME_BROWSER_KEY]: JSON.stringify('dark') })
      stubCapableStorage()

      renderApp(createTestPorts())
      const shell = await findTheShell()

      expect(shellTheme(shell)).toBe('dark')
    },
    WHOLE_APPLICATION_TIMEOUT_MS,
  )
})
