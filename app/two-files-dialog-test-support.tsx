import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, vi } from 'vitest'
import { reconcileIndex } from '../session'
import {
  MAIN_NAME,
  MAIN_PATH,
  SECOND_NAME,
  SECOND_PATH,
  mainBytesOf,
  secondBytes,
  storeFolderProject,
} from '../session/flows/choose-kept-file-test-kit'
import type { ProjectState } from '../session/flows/choose-kept-file-test-kit'
import { PROJECT_ID } from '../session/flows/open-failed-test-kit'
import {
  createTestPorts,
  movableClock,
  placeDocument,
  storedProject,
} from '../session/handle/handle-test-kit'
import type { MovableClock, TestPorts } from '../session/handle/handle-test-kit'
import { IMAGE } from '../session/flows/import-file-test-kit'
import {
  SECOND_FILE_NAME,
  documentReferring,
  placeSecondFile,
} from '../session/handle/second-file-test-kit'
import { folderRecord } from '../session/projects/rebuild-test-kit'
import { DirectoryAssetCache, InMemoryDirectory } from '../storage'
import type { ProjectRecord } from '../storage'
import { contentHashOf } from '../storage/zip/zip-test-kit'
import type { MemoryAddressBar } from './address-bar'
import {
  AUTOSAVE_TIMEOUT_MS,
  backToTheProject,
  editTheProject,
  expectOpenProject,
  filesUnder,
  findTheProjectsPage,
  lockedIds,
  plantProject,
  renderAppAt,
  secondTab,
} from './app-test-support'
import type { RenderedApp } from './app-test-support'
import { PROJECTS_ADDRESS, addressOf } from './history-navigation-test-support'
import { openTheMenuOf, showThePageOn } from './projects-screen-test-support'

/** Test support: the Projects page over projects with two plan files, and the steps of the choice between them. */

/** The title of the dialog that offers the choice between the two plan files. */
export const TWO_FILES_TITLE = 'This project has two plan files'

/** The entry of a card menu that opens the dialog. */
export const CHOOSE_A_PLAN_FILE = 'Choose a plan file'

/** The line on the card of a project that has a second plan file. */
export const SECOND_FILE_LINE = 'This project has a second plan file.'

export const KEEP_BOTH = 'Keep both plan files'
export const KEEP_BOTH_CONTROL = 'Open and keep both plan files'
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

/** Durable ports over files that carry the times of the clock, and the clock. */
function durablePortsOnAClock(): { readonly ports: TestPorts; readonly clock: MovableClock } {
  const clock = movableClock(new Date(MAIN_STORED_AT))
  const root = new InMemoryDirectory({ now: clock.now })
  return { ports: createTestPorts({ root, durable: true }), clock }
}

function rewriterOn(
  ports: TestPorts,
  clock: MovableClock,
): PortsWithTwoFiles['rewriteTheSecondFile'] {
  return async (bytes, time) => {
    clock.moveTo(new Date(time))
    await placeSecondFile(ports, PROJECT_ID, bytes)
  }
}

/**
 * Durable ports that hold the project `a` with two plan files in `state`: the main file stored
 * at `MAIN_STORED_AT`, the second file at `SECOND_STORED_AT`. The index holds the record, which
 * says that the project has a second plan file.
 */
export async function portsWithTwoFiles(
  state: ProjectState,
  second: Uint8Array = secondBytes(),
): Promise<PortsWithTwoFiles> {
  const { ports, clock } = durablePortsOnAClock()
  await placeDocument(ports, PROJECT_ID, mainBytesOf(state))
  clock.moveTo(new Date(SECOND_STORED_AT))
  await placeSecondFile(ports, PROJECT_ID, second)
  await reconcileIndex(ports)
  return { ports, rewriteTheSecondFile: rewriterOn(ports, clock) }
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

/** The name that a second plan file holds after another program rewrote it. */
export const REWRITTEN_NAME = 'Rewritten while the dialog showed'

/** A project of this tab that has no second plan file, and its name. */
export const QUIET_ID = 'quiet'
export const QUIET_NAME = 'Quiet house'

/** Ports and the page of a tab that holds a project, with the Projects page over it. */
export interface HeldProject extends PortsWithTwoFiles {
  readonly bar: MemoryAddressBar
  /** The id and the name of the project that this tab holds. */
  readonly id: string
  readonly name: string
}

/**
 * The page of a tab that holds the project `a`, which has two plan files in `state`, with the
 * Projects page over it. A newer main file leaves only the second file to open from. Where the main
 * file is readable, the second file is stored after the open, as a program in another tab would.
 */
export async function holdTheProject(
  state: ProjectState,
  second: Uint8Array = secondBytes(),
): Promise<HeldProject> {
  const { ports, clock } = durablePortsOnAClock()
  const opensFromTheSecondFile = state === 'newer-main'
  await placeDocument(ports, PROJECT_ID, mainBytesOf(state))
  clock.moveTo(new Date(SECOND_STORED_AT))
  if (opensFromTheSecondFile) await placeSecondFile(ports, PROJECT_ID, second)
  await reconcileIndex(ports)
  const { bar } = renderAppAt(ports, addressOf(PROJECT_ID))
  const name = opensFromTheSecondFile ? SECOND_NAME : MAIN_NAME
  await expectOpenProject(name)
  if (!opensFromTheSecondFile) {
    await placeSecondFile(ports, PROJECT_ID, second)
    await reconcileIndex(ports)
  }
  await showThePageOn(bar)
  await findTheLineOfTheSecondFile()
  return { ports, bar, id: PROJECT_ID, name, rewriteTheSecondFile: rewriterOn(ports, clock) }
}

/** The page of a tab that holds the project `quiet`, over the project `a` that has two plan files. */
export async function holdAnotherProject(): Promise<HeldProject> {
  const { ports, rewriteTheSecondFile } = await portsWithTwoFiles('both-readable')
  await plantProject(ports, QUIET_ID, QUIET_NAME)
  await reconcileIndex(ports)
  const { bar } = renderAppAt(ports, addressOf(QUIET_ID))
  await expectOpenProject(QUIET_NAME)
  await showThePageOn(bar)
  await findTheLineOfTheSecondFile()
  return { ports, bar, id: QUIET_ID, name: QUIET_NAME, rewriteTheSecondFile }
}

/** Opens the dialog from the card of the project `a`, over the page that shows already. */
export async function openTheDialogOverTheProject(held: HeldProject): Promise<HTMLElement> {
  await chooseAPlanFileOnTheCard(held.ports)
  return findTheTwoFilesDialog()
}

/**
 * Leaves the Projects page, as a user does, and expects what a tab that holds the project shows:
 * the editor on the project `name`, its lock held by this tab alone, and an edit that is stored.
 */
export async function expectTheTabToHoldTheProject(
  held: HeldProject,
  name = held.name,
): Promise<void> {
  await backToTheProject(name)
  await expectOpenProject(name)
  expect(lockedIds(held.ports)).toEqual([held.id])
  expect(await secondTab(held.ports).locks.tryAcquire(held.id)).toBeUndefined()
  const floorsBefore = (await storedProject(held.ports.workspace, held.id)).floors.length
  await editTheProject()
  await waitFor(
    async () =>
      expect((await storedProject(held.ports.workspace, held.id)).floors).toHaveLength(
        floorsBefore + 1,
      ),
    { timeout: AUTOSAVE_TIMEOUT_MS },
  )
}

/** Expects the Projects page to stay at its address, with no entry added to the history. */
export function expectThePageToStay(held: HeldProject, entriesBefore: readonly string[]): void {
  expect(held.bar.hash()).toBe(PROJECTS_ADDRESS)
  expect(held.bar.entries()).toEqual(entriesBefore)
}

/**
 * From now on, a request for the lock of the project `a` finds another tab holding it, unless this
 * tab holds it: the lock that a choice frees cannot be taken again.
 */
export function letAnotherTabTakeTheLockWhenItIsFreed(ports: TestPorts): void {
  const tryAcquire = ports.locks.tryAcquire.bind(ports.locks)
  vi.spyOn(ports.locks, 'tryAcquire').mockImplementation((id) =>
    lockedIds(ports).includes(id) ? tryAcquire(id) : Promise.resolve(undefined),
  )
}

/**
 * Durable ports whose project `a` is kept in a folder, with a main file that a newer build wrote
 * and a second file that uses one image. The folder holds the image when `folderHoldsTheImage`.
 */
export async function portsWithAFolderProjectInTwoFiles(
  folderHoldsTheImage: boolean,
): Promise<TestPorts> {
  const ports = createTestPorts({ durable: true })
  const folder = await storeFolderProject(ports, 'newer-main')
  const imageHash = await contentHashOf(IMAGE)
  if (folderHoldsTheImage) await new DirectoryAssetCache(folder).put(imageHash, IMAGE)
  await folder.writeFile(SECOND_FILE_NAME, documentReferring([imageHash]))
  const secondFile = { name: SECOND_FILE_NAME, read: 'second' } as const
  await ports.index.put(folderRecord(PROJECT_ID, { secondFile }))
  return ports
}
