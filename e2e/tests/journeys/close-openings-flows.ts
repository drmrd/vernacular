import { expect, type Locator, type Page } from '@playwright/test'
import { logReading, settledSceneCanvas, stableFrame } from '../scene-helpers'
import type { Region } from '../frame-pixels'
import { signatureOf, startSampling, stopSampling, type Signature } from '../region-sampler'
import {
  clearSelection,
  closeControl,
  enterWalk,
  enterWalkReady,
  frameAfterChange,
  liveCanvas,
  openKeyChangesView,
  openRoomIn3d,
  openWithKey,
  orbitSouthFrame,
  paintSelection,
  selectFloor,
  settledLiveFrame,
  strafe,
  toggleEdges,
  walkToDoor,
} from './close-openings-support'
import { viewsOf, type Views } from './close-openings-views'
import { gotoEditor } from './support'
import { guardLiveSceneSupport } from '../live-webgpu'

// Longer flows that put the room into a state a journey then examines: a door open as seen from
// orbit mode, and the search that walks the camera to an opening.

// How far the first strafe goes, which takes the walker clear of the opening it stands at, and
// how far each step after it goes. A step is a key held for a short time, so the distance is not
// exact, which is why the search tests for the opening after every step.
const FIRST_STRIDE_MS = 350
const STEP_MS = 80
const MAX_STEPS = 30
// Each wrong hit costs a trip to orbit mode and back, so the search gives up after a few.
const MAX_WRONG_HITS = 3

// The door seen from the south in orbit mode: the frame before anything opened, the frame
// with the door open, and the door's region. The door is opened by the walker with the key.
export async function openDoorSeenFromOrbit(
  page: Page,
  canvas: Locator,
): Promise<{ never: Buffer; open: Buffer; region: Region }> {
  const never = await orbitSouthFrame(page, canvas)
  const atShut = await walkToDoor(page, canvas)
  await openWithKey(page, canvas, atShut)
  const open = await orbitSouthFrame(page, canvas)
  return { never, open, region: await viewsOf(page).openingRegion(never, open) }
}

// Opens the door again with the key from the walker's saved pose, then returns to the south
// view in orbit mode. Use it after the control has shut the door.
export async function reopenSeenFromOrbit(page: Page, canvas: Locator): Promise<Buffer> {
  const atShut = await enterWalkReady(page, canvas)
  await openWithKey(page, canvas, atShut)
  return orbitSouthFrame(page, canvas)
}

// The opening a search must end with open: the south view in orbit mode must differ from the
// all-shut view inside the wanted region. The key is the sideways key the walker strafes with.
// When another opening is already open, the search expects the key to leave it alone, because
// the walker is far from it when the search starts (see wantedOpening). A press after a strafe
// could still swing it, so a change that is not the wanted opening then fails.
export interface SearchTarget {
  readonly key: string
  readonly never: Buffer
  readonly wanted: Region
  readonly otherOpen: boolean
}

// The press of the open key hit some opening. Looks from orbit mode whether it is the wanted
// one, and returns the orbit frame if so.
//
// If not, the wrong opening is open and the walker is not at the wanted one. The open key cannot
// shut a door again from this pose: measured on the live view, a swing door that stands fully
// open is parallel to the reach ray from the head-on pose that opened it, so a second press does
// nothing. (A hung window is reached again, because the reach treats it as its shut frame; the
// window scenario that presses the key twice checks that.) The toolbar control shuts either
// one, and the control being disabled again confirms that nothing is left open. That undo is
// only taken when no other opening was open before the search, because the control shuts all of
// them.
async function wantedOpening(
  page: Page,
  canvas: Locator,
  target: SearchTarget,
): Promise<Buffer | null> {
  const orbit = await orbitSouthFrame(page, canvas)
  if (!(await viewsOf(page).equal(orbit, target.never, target.wanted))) return orbit
  if (target.otherOpen) {
    throw new Error(
      'the open key changed an opening other than the wanted one, while another opening was open',
    )
  }
  logReading('search', 'the open key opened a wrong opening; shutting it with the control')
  const atWrong = await enterWalkReady(page, canvas)
  await closeControl(page).click()
  await expect(closeControl(page)).toBeDisabled()
  await frameAfterChange(canvas, atWrong)
  return null
}

// Walks sideways in steps from where the walker stands, pressing the open key after each step,
// until the key opens the wanted opening, and returns the orbit frame that shows it open. The
// walker's pose is found by this search because a held key moves it by an amount that depends
// on the frame rate. An opening that the key opens by mistake on the way is shut again, up to
// MAX_WRONG_HITS times, so that a wanted opening that never shows fails with its own message
// long before the test timeout.
export async function strafeUntilOpened(
  page: Page,
  canvas: Locator,
  target: SearchTarget,
): Promise<Buffer> {
  await strafe(page, target.key, FIRST_STRIDE_MS)
  let wrongHits = 0
  for (let step = 0; step < MAX_STEPS; step++) {
    if (await openKeyChangesView(page, canvas)) {
      const opened = await wantedOpening(page, canvas, target)
      if (opened !== null) return opened
      wrongHits += 1
      if (wrongHits >= MAX_WRONG_HITS) {
        throw new Error(
          `the wanted opening did not show after ${wrongHits} presses that opened another one (${target.key})`,
        )
      }
    }
    await strafe(page, target.key, STEP_MS)
  }
  throw new Error(`the wanted opening did not open in ${MAX_STEPS} steps of ${target.key}`)
}

// A frame the journey settled on, and the readings of a region on every frame that led to it.
export interface Watched {
  readonly frame: Buffer
  readonly readings: Signature[]
}

// Switches the surface edges on and then off while a sampler reads the region, and returns the
// frame with the edges on, the frame after they are off again, and the readings of the region.
export async function toggleEdgesWhileWatching(
  page: Page,
  canvas: Locator,
  watch: { before: Buffer; region: Region },
): Promise<Watched & { on: Buffer }> {
  await startSampling(page, watch.region)
  const on = await toggleEdges(page, canvas, watch.before)
  const frame = await toggleEdges(page, canvas, on)
  return { on, frame, readings: await stopSampling(page) }
}

// Selects the floor and paints it while a sampler reads the region, then clears the selection.
// Returns the settled frame with the paint on, and the readings.
export async function paintFloorWhileWatching(
  page: Page,
  canvas: Locator,
  region: Region,
): Promise<Watched> {
  const selected = await selectFloor(page, canvas)
  await startSampling(page, region)
  await paintSelection(page)
  const painted = await frameAfterChange(canvas, selected)
  const frame = await clearSelection(page, canvas, painted)
  return { frame, readings: await stopSampling(page) }
}

// Goes to the plan view and back to the 3D view while a sampler reads the region, which
// unmounts the 3D canvas and mounts a new one (settledSceneCanvas clicks the 3D view button).
// Returns the settled frame of the new canvas.
export async function switchViewsWhileWatching(page: Page, region: Region): Promise<Watched> {
  await startSampling(page, region)
  await page.getByRole('button', { name: 'Plan view', exact: true }).click()
  await expect(liveCanvas(page)).toHaveCount(0)
  const canvas = await settledSceneCanvas(page)
  const frame = await settledLiveFrame(page, canvas)
  return { frame, readings: await stopSampling(page) }
}

// Starts the walk from orbit mode while a sampler reads the region, so the readings include the
// first frames of the walker's view. Returns the first settled frame of the walk.
export async function startWalkWhileWatching(
  page: Page,
  canvas: Locator,
  region: Region,
): Promise<Watched> {
  const orbit = await stableFrame(canvas)
  await startSampling(page, region)
  await enterWalk(page)
  const frame = await frameAfterChange(canvas, orbit)
  return { frame, readings: await stopSampling(page) }
}

// The reading of the door region with the door shut and the surface edges drawn. The first
// rebuild in the edges journey shows the door with the edges on, so a shut frame in it looks
// like this and not like the shut reading with the edges off. The door must be shut when this
// is called, and the edges are left off.
export async function shutReadingWithEdges(
  page: Page,
  canvas: Locator,
  watch: { shut: Buffer; region: Region },
): Promise<Signature> {
  const on = await toggleEdges(page, canvas, watch.shut)
  const reading = await signatureOf(page, watch.region)
  await toggleEdges(page, canvas, on)
  return reading
}

// Opens the editor, skips or fails where the runner has no WebGPU adapter, builds the room with
// its door and window, and returns the settled 3D canvas and the frame reader of the page.
export async function startOnLiveRoom(
  page: Page,
  subject: string,
): Promise<{ canvas: Locator; views: Views }> {
  await gotoEditor(page)
  await guardLiveSceneSupport(page, subject)
  return { canvas: await openRoomIn3d(page), views: viewsOf(page) }
}
