import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect } from 'vitest'
import { reconcileIndex } from '../session'
import {
  PROJECT_ID,
  mixedPaintBytes,
  placeInWorkspace,
} from '../session/flows/open-failed-test-kit'
import type { TestPorts } from '../session/handle/handle-test-kit'
import {
  FAILED_ID,
  filesUnder,
  plantFailedProject,
  renderAppAt,
  usedLast,
  type RenderedApp,
} from './app-test-support'
import { FIRST_ID, PROJECTS_ADDRESS, durablePortsWith } from './history-navigation-test-support'
import { findTheCardThatDidNotOpen } from './projects-screen-test-support'

/** Test support: the set-up and the steps that the tests of the failed-open dialog on the page share. */

/** The title of the dialog for a project that is stored. */
export const STORED_TITLE = 'This project did not open.'

/** The title of the dialog for a file that was chosen or dropped. */
export const FILE_TITLE = 'This file did not open.'

/** The title of the dialog that asks how to open the repaired project. */
export const CHOICE_TITLE = 'Open the repaired project'

/** The cause that the dialog gives for the stored project that a newer build wrote. */
export const NEWER_VERSION_CAUSE = 'A newer version of Vernacular made this project.'

/** The sentence of the repair that removes the extra data of two paint entries. */
export const PAINT_REPAIR_SENTENCE = 'It removes the extra data from 2 paint entries.'

/** Waits for the failed-open dialog with the title `title`, in `container` when one is given. */
export function findTheFailedOpenDialog(
  title = STORED_TITLE,
  container?: HTMLElement,
): Promise<HTMLElement> {
  return within(container ?? document.body).findByRole('alertdialog', { name: title })
}

/** Waits for the dialog that asks how to open the repaired project. */
export function findTheChoiceDialog(): Promise<HTMLElement> {
  return screen.findByRole('alertdialog', { name: CHOICE_TITLE })
}

/** Clicks the button named `name` inside `dialog`. */
export async function clickInTheDialog(dialog: HTMLElement, name: string): Promise<void> {
  await userEvent.click(within(dialog).getByRole('button', { name }))
}

/** Where the dialog to close shows and what its title is; the page and the stored title by default. */
export interface CloseTheDialogOptions {
  readonly container?: HTMLElement
  readonly title?: string
}

/**
 * Waits for the failed-open dialog of `container` or of the page, presses Close, and waits until no
 * dialog shows in `container` or, without one, in the page.
 */
export async function closeTheDialog(options: CloseTheDialogOptions = {}): Promise<void> {
  const { container, title = STORED_TITLE } = options
  await clickInTheDialog(await findTheFailedOpenDialog(title, container), 'Close')
  const scope = within(container ?? document.body)
  await waitFor(() => expect(scope.queryByRole('alertdialog')).not.toBeInTheDocument())
}

/** Durable ports with an ordinary project and a project that a newer build wrote, used last. */
export async function portsWhoseLatestProjectDoesNotOpen(): Promise<TestPorts> {
  const ports = await durablePortsWith(FIRST_ID)
  await plantFailedProject(ports)
  await reconcileIndex(ports)
  await usedLast(ports, FAILED_ID)
  return ports
}

/**
 * Durable ports whose only project is stored as `bytes`, which by default break the format rules in
 * a way that a repair can fix. The index holds its record.
 */
export async function portsWithARepairableProject(
  bytes: Uint8Array = mixedPaintBytes(),
): Promise<TestPorts> {
  const ports = await durablePortsWith()
  await placeInWorkspace(ports, bytes)
  await reconcileIndex(ports)
  await usedLast(ports, PROJECT_ID)
  return ports
}

/** The files below the directory of the repairable project, to compare before and after. */
export function filesOfTheRepairableProject(ports: TestPorts): Promise<Map<string, string>> {
  return filesUnder(ports.root, PROJECT_ID)
}

/** Renders the Projects page, clicks the card that did not open, and waits for the dialog. */
export async function openTheDialogFromTheCard(
  ports: TestPorts,
): Promise<{ readonly dialog: HTMLElement; readonly rendered: RenderedApp }> {
  const rendered = renderAppAt(ports, PROJECTS_ADDRESS)
  await userEvent.click(await findTheCardThatDidNotOpen())
  return { dialog: await findTheFailedOpenDialog(), rendered }
}

/** Clicks "Open with the repair" and waits for the choice dialog. */
export async function openTheChoice(dialog: HTMLElement): Promise<HTMLElement> {
  await clickInTheDialog(dialog, 'Open with the repair')
  return findTheChoiceDialog()
}
