import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, vi } from 'vitest'
import { reconcileIndex } from '../session'
import {
  MAIN_PATH,
  SECOND_PATH,
  mainBytesOf,
  secondBytes,
} from '../session/flows/choose-kept-file-test-kit'
import type { ProjectState } from '../session/flows/choose-kept-file-test-kit'
import { PROJECT_ID } from '../session/flows/open-failed-test-kit'
import { createTestPorts, movableClock, placeDocument } from '../session/handle/handle-test-kit'
import type { TestPorts } from '../session/handle/handle-test-kit'
import { SECOND_FILE_NAME, placeSecondFile } from '../session/handle/second-file-test-kit'
import { InMemoryDirectory } from '../storage'
import type { ProjectRecord } from '../storage'
import { filesUnder, findTheProjectsPage, renderAppAt } from './app-test-support'
import type { RenderedApp } from './app-test-support'
import { PROJECTS_ADDRESS } from './history-navigation-test-support'
import { openTheMenuOf } from './projects-screen-test-support'

/** Test support: the Projects page over projects with two plan files, and the steps of the choice between them. */

/** The title of the dialog that offers the choice between the two plan files. */
export const TWO_FILES_TITLE = 'This project has two plan files'

/** The entry of a card menu that opens the dialog. */
export const CHOOSE_A_PLAN_FILE = 'Choose a plan file'

/** The line on the card of a project that has a second plan file. */
export const SECOND_FILE_LINE = 'This project has a second plan file.'

export const KEEP_BOTH = 'Keep both plan files'
export const OPEN_AS_NEW = 'Open the second plan file as a new project'
export const REPLACE_CONTROL = 'Replace vernacular.json with the second plan file'
export const REMOVE_CONTROL = 'Remove the second plan file'

/** When the main file, the second file, and a later rewrite of the second file were stored. */
export const MAIN_STORED_AT = '2026-03-01T09:00:00.000Z'
export const SECOND_STORED_AT = '2026-03-05T17:30:00.000Z'
export const REWRITTEN_AT = '2026-03-09T11:45:00.000Z'

/** The sentence of the dialog beside a newer main file. */
export const NEWER_MAIN_SENTENCE =
  'A newer version of Vernacular saved the plan file vernacular.json. This version cannot read it. ' +
  `The second plan file, ${SECOND_FILE_NAME}, holds the changes that this version saved.`

/** The time as the card writes it: the medium date and the short time of the user's locale. */
function cardTime(time: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(time),
  )
}

/** The sentence of the dialog when the build reads both files, for the times of their last change. */
export function bothReadableSentence(main: string, second: string): string {
  return (
    `The plan file vernacular.json changed on ${cardTime(main)}. ` +
    `The second plan file, ${SECOND_FILE_NAME}, changed on ${cardTime(second)}. ` +
    'An older version of Vernacular saved the second plan file.'
  )
}

/** Durable ports whose clock the test moves, with a store that reads the files at the time they were written. */
export interface PortsWithTwoFiles {
  readonly ports: TestPorts
  /** Stores `bytes` as the second file, as a write at `time`. */
  rewriteTheSecondFile(bytes: Uint8Array, time: string): Promise<void>
}

/**
 * Durable ports that hold the project `a` with two plan files in `state`: the main file stored
 * at `MAIN_STORED_AT`, the second file at `SECOND_STORED_AT`. The index holds the record, which
 * says that the project has a second plan file.
 */
export async function portsWithTwoFiles(state: ProjectState): Promise<PortsWithTwoFiles> {
  const clock = movableClock(new Date(MAIN_STORED_AT))
  const root = new InMemoryDirectory({ now: clock.now })
  const ports = createTestPorts({ root, durable: true })
  await placeDocument(ports, PROJECT_ID, mainBytesOf(state))
  clock.moveTo(new Date(SECOND_STORED_AT))
  await placeSecondFile(ports, PROJECT_ID, secondBytes())
  await reconcileIndex(ports)
  return {
    ports,
    async rewriteTheSecondFile(bytes, time) {
      clock.moveTo(new Date(time))
      await placeSecondFile(ports, PROJECT_ID, bytes)
    },
  }
}

/** The files below the directory of the project `a`, to compare before and after. */
export function filesOfTheProject(ports: TestPorts): Promise<Map<string, string>> {
  return filesUnder(ports.root, PROJECT_ID)
}

/** The bytes of the main file and of the second file of the project `a`; undefined for a file that is not stored. */
export async function storedFiles(ports: TestPorts) {
  return {
    main: await ports.root.readFile(MAIN_PATH),
    second: await ports.root.readFile(SECOND_PATH),
  }
}

/** Removes the second file and the mark of it in the record, as another tab that chose would. */
export async function endTheTwoFilesInAnotherTab(ports: TestPorts): Promise<void> {
  await ports.root.removeFile(SECOND_PATH)
  const record = await ports.index.get(PROJECT_ID)
  if (record === undefined) throw new Error('the index holds no record of the project')
  const withoutTheMark = Object.fromEntries(
    Object.entries(record).filter(([field]) => field !== 'secondFile'),
  )
  await ports.index.put(withoutTheMark as unknown as ProjectRecord)
}

/** The name of the project `a` on its card. */
async function cardNameOf(ports: TestPorts): Promise<string> {
  const record = await ports.index.get(PROJECT_ID)
  if (record?.name === undefined) throw new Error('the record of the project has no name')
  return record.name
}

/** Waits until the Projects page shows the line of a second plan file on a card. */
export async function findTheLineOfTheSecondFile(): Promise<HTMLElement> {
  return within(await findTheProjectsPage()).findByText(SECOND_FILE_LINE)
}

/** Waits until no card on the Projects page has the line of a second plan file. */
export function expectNoLineOfTheSecondFile(): Promise<void> {
  return waitFor(() => expect(screen.queryByText(SECOND_FILE_LINE)).not.toBeInTheDocument())
}

/** Renders the Projects page on `ports` and waits until a card says that its project has a second plan file. */
export async function showThePageOf(ports: TestPorts): Promise<RenderedApp> {
  const rendered = renderAppAt(ports, PROJECTS_ADDRESS)
  await findTheLineOfTheSecondFile()
  return rendered
}

/** Opens the menu of the card of the project `a` and chooses "Choose a plan file". */
export async function chooseAPlanFileOnTheCard(ports: TestPorts): Promise<void> {
  await openTheMenuOf(await cardNameOf(ports))
  await userEvent.click(await screen.findByRole('menuitem', { name: CHOOSE_A_PLAN_FILE }))
}

/** Waits for the dialog of the choice between the two plan files. */
export function findTheTwoFilesDialog(): Promise<HTMLElement> {
  return screen.findByRole('alertdialog', { name: TWO_FILES_TITLE })
}

/** Renders the page, opens the dialog from the card of the project `a`, and gives the dialog. */
export async function openTheTwoFilesDialog(ports: TestPorts): Promise<HTMLElement> {
  await showThePageOf(ports)
  await chooseAPlanFileOnTheCard(ports)
  return findTheTwoFilesDialog()
}

/** Waits until the dialog of the choice reads `sentence`. */
export function expectTheDialogToSay(sentence: string): Promise<void> {
  return waitFor(() => expect(screen.getByRole('alertdialog')).toHaveTextContent(sentence))
}

/** Waits until no dialog shows. */
export function expectNoDialog(): Promise<void> {
  return waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
}

/** Clicks the control named `name` in `dialog`. */
export async function chooseInTheDialog(dialog: HTMLElement, name: string): Promise<void> {
  await userEvent.click(within(dialog).getByRole('button', { name }))
}

/** The store methods that carry out a choice. */
export type ChoiceMethod = 'readSecondFile' | 'promoteSecondFile' | 'setAsideSecondFile'

/** A choice that waits in its store method until `release` runs, and the spy that counts its calls. */
export interface HeldChoice {
  readonly calls: ReturnType<typeof vi.fn>
  release(): void
}

type StoreMethod = (...args: unknown[]) => Promise<unknown>

/** Holds the store method `method` of the workspace until `release` runs, then carries on as it does. */
export function holdTheChoice(ports: TestPorts, method: ChoiceMethod): HeldChoice {
  const store = ports.workspace as unknown as Record<ChoiceMethod, StoreMethod>
  const real = store[method].bind(ports.workspace)
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const calls = vi.spyOn(store, method).mockImplementation(async (...args) => {
    await gate
    return real(...args)
  })
  return { calls, release: () => release() }
}
