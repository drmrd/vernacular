import { expect, type Locator, type Page } from '@playwright/test'
import { stableFrame } from '../scene-helpers'
import type { Region } from '../frame-pixels'
import { startSampling, stopSampling, type Signature } from '../region-sampler'
import {
  clearSelection,
  enterWalk,
  frameAfterChange,
  liveCanvas,
  openKeyChangesView,
  openWithKey,
  orbitSouthFrame,
  paintSelection,
  selectFloor,
  settledCanvasFrame,
  strafe,
  toggleEdges,
  walkToDoor,
} from './close-openings-support'
import { openingRegion, viewsAreEqual } from './close-openings-views'

// Longer flows that put the room into a state a journey then examines: a door open as seen from
// orbit mode, and the search that walks the camera to an opening.

// How far the first strafe goes, which takes the walker clear of the opening it stands at, and
// how far each step after it goes. A step is a key held for a short time, so the distance is not
// exact, which is why the search tests for the opening after every step.
const FIRST_STRIDE_MS = 350
const STEP_MS = 80
const MAX_STEPS = 30
// A key pressed right after a camera switch can arrive before the walk listeners are back.
const UNDO_ATTEMPTS = 3

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
  return { never, open, region: openingRegion(never, open) }
}

// Opens the door again with the key from the walker's saved pose, then returns to the south
// view in orbit mode. Use it after the control has shut the door.
export async function reopenSeenFromOrbit(page: Page, canvas: Locator): Promise<Buffer> {
  await enterWalk(page)
  await openWithKey(page, canvas, await stableFrame(canvas))
  return orbitSouthFrame(page, canvas)
}

// The opening a search must end with open: the south view in orbit mode must differ from the
// all-shut view inside the wanted region. The key is the sideways key the walker strafes with.
export interface SearchTarget {
  readonly key: string
  readonly never: Buffer
  readonly wanted: Region
}

// The press of the open key hit some opening. Looks from orbit mode whether it is the wanted
// one. If not, goes back to the walker and presses the key again at the same pose, which swings
// that opening back. Returns the orbit frame when the wanted opening is open.
async function wantedOpening(
  page: Page,
  canvas: Locator,
  target: SearchTarget,
): Promise<Buffer | null> {
  const orbit = await orbitSouthFrame(page, canvas)
  if (!viewsAreEqual(orbit, target.never, target.wanted)) return orbit
  await enterWalk(page)
  for (let attempt = 0; attempt < UNDO_ATTEMPTS; attempt++) {
    if (await openKeyChangesView(page, canvas)) return null
  }
  throw new Error('the open key did not swing back the opening it opened by mistake')
}

// Walks sideways in steps from where the walker stands, pressing the open key after each step,
// until the key opens the wanted opening, and returns the orbit frame that shows it open. The
// walker's pose is found by this search because a held key moves it by an amount that depends
// on the frame rate. An opening that the key swings by mistake on the way is swung back.
export async function strafeUntilOpened(
  page: Page,
  canvas: Locator,
  target: SearchTarget,
): Promise<Buffer> {
  await strafe(page, target.key, FIRST_STRIDE_MS)
  for (let step = 0; step < MAX_STEPS; step++) {
    if (await openKeyChangesView(page, canvas)) {
      const opened = await wantedOpening(page, canvas, target)
      if (opened !== null) return opened
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
// unmounts the 3D canvas and mounts a new one. Returns the settled frame of the new canvas.
export async function switchViewsWhileWatching(page: Page, region: Region): Promise<Watched> {
  await startSampling(page, region)
  await page.getByRole('button', { name: 'Plan view', exact: true }).click()
  await expect(liveCanvas(page)).toHaveCount(0)
  await page.getByRole('button', { name: '3D view', exact: true }).click()
  const frame = await settledCanvasFrame(page, liveCanvas(page))
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
