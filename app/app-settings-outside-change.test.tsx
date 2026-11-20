import { act, cleanup, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestPorts } from '../session/handle/handle-test-kit'
import { LocalStorageSettingsPort } from '../storage'
import { storageEventOf } from '../storage/settings/settings-storage-test-kit'
import { imitateBrowserStorage, WHOLE_APPLICATION_TIMEOUT_MS } from './app-settings-test-support'
import { findTheShell, renderApp, stubCapableStorage } from './app-test-support'

/** The key under which the browser keeps the theme choice. */
const THEME_BROWSER_KEY = 'vernacular.settings.theme'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** The theme that the element with a `data-theme` attribute around the shell shows. */
function shellTheme(shell: HTMLElement): string | null | undefined {
  return shell.closest('[data-theme]')?.getAttribute('data-theme')
}

describe('the theme of the application when another browser tab changes it', () => {
  it(
    'follows a theme that another tab stored, with no reload',
    async () => {
      const browser = imitateBrowserStorage({ [THEME_BROWSER_KEY]: JSON.stringify('light') })
      stubCapableStorage()
      renderApp(createTestPorts(), { settings: new LocalStorageSettingsPort() })
      const shell = await findTheShell()
      expect(shellTheme(shell)).toBe('light')

      browser.entries.set(THEME_BROWSER_KEY, JSON.stringify('dark'))
      act(() => {
        window.dispatchEvent(storageEventOf(THEME_BROWSER_KEY))
      })

      await waitFor(() => {
        expect(shellTheme(shell)).toBe('dark')
      })
    },
    WHOLE_APPLICATION_TIMEOUT_MS,
  )
})
