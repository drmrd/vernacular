import { expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import {
  documentNamed,
  storeNewerMainBesideSecondFile,
} from '../session/handle/second-file-test-kit'
import { createTestPorts } from '../session/handle/handle-test-kit'
import type { TestPorts } from '../session/handle/handle-test-kit'
import { AUTOSAVE_TIMEOUT_MS, START_ID } from './app-test-support'

/** Test support: the application over projects that a newer build left with a second plan file. */

/** The name that the document of the second file carries. */
export const SECOND_FILE_PROJECT_NAME = 'Saved by a newer build'

/**
 * Ports over durable files that hold the start project with a newer main file, beside a second
 * file that this build reads. The application opens the project from the second file.
 */
export async function portsWithTheProjectInASecondFile(): Promise<TestPorts> {
  const ports = createTestPorts({ durable: true })
  await storeNewerMainBesideSecondFile(ports, START_ID, documentNamed(SECOND_FILE_PROJECT_NAME))
  return ports
}

/** The text of each live region of the open editor, in the order of the page. */
function statusReadouts(): string[] {
  return screen.queryAllByRole('status').map((region) => region.textContent ?? '')
}

/** Waits until a live region of the editor reads exactly `text`. */
export function waitForTheStatus(text: string): Promise<void> {
  return waitFor(() => expect(statusReadouts()).toContain(text), { timeout: AUTOSAVE_TIMEOUT_MS })
}
