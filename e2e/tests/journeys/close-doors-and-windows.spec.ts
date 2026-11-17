import { test, expect } from '@playwright/test'
import { gotoEditor } from './support'
import { stableFrame } from '../scene-helpers'
import { wholeFrame } from '../frame-pixels'
import { framesShowing, signatureOf } from '../region-sampler'
import { guardLiveSceneSupport, configureGpuChromiumOnMac } from '../live-webgpu'
import {
  closeControl,
  enterOrbit,
  enterWalk,
  frameAfterChange,
  holdWalkKey,
  navButton,
  openRoomIn3d,
  openWithKey,
  orbitSouthFrame,
  resetWithKey,
  walkToDoor,
} from './close-openings-support'
import {
  closeTogether,
  closeWithControl,
  eastOf,
  expectDifferentView,
  expectSameView,
  openingRegion,
  upperPart,
  within,
} from './close-openings-views'
import {
  openDoorSeenFromOrbit,
  paintFloorWhileWatching,
  reopenSeenFromOrbit,
  startWalkWhileWatching,
  strafeUntilOpened,
  switchViewsWhileWatching,
  toggleEdgesWhileWatching,
} from './close-openings-flows'

// The "Close doors and windows" control in the 3D toolbar (issue #533) has unit and hook tests
// for the stored set of open openings and for the wiring. This journey checks what a person
// sees on the live view: a door swings shut when the control is pressed, stays open through
// scene rebuilds, and is shut again when the walker returns. The code that moves the openings
// runs in the frame callback of the 3D canvas, which a jsdom test cannot exercise.
//
// The live view renders through the non-deterministic WebGPU backend (ADR-0045), so this spec
// commits no pixel baseline. Frames taken in the same run are compared with each other, in the
// region of the opening, and an in-page sampler reads that region on every animation frame to
// see the frames in between. It needs a real WebGPU adapter and follows the same self-skip
// policy as the perceived-color journey: it skips without one, and E2E_REQUIRE_WEBGPU=1 turns
// the skip into a failure, which the macOS live-view job sets.
//
// One thing is not asserted. On a fresh page the walker starts at a pose where the door is out
// of sight, so the walker's first frames cannot show its leaf, and that case reads the control
// and the orbit view instead. Walker views are also never compared by pixels across a scene
// rebuild: the walker view is shaded differently after a rebuild even when no door was opened,
// which is a separate known issue (#781).

configureGpuChromiumOnMac()

// The tests share one GPU adapter, and a frame read while another page renders is slower and
// noisier, so they run one after another in a single worker.
test.describe.configure({ mode: 'default' })

const SUBJECT = 'the close-doors-and-windows journey'
const NOTHING_TO_CLOSE = 'Nothing to close. Open a door or window in walk mode with the E key.'

test('closes a door opened in walk mode from the 3D toolbar, in orbit mode and in walk mode', async ({
  page,
}) => {
  await gotoEditor(page)
  await guardLiveSceneSupport(page, SUBJECT)
  const canvas = await openRoomIn3d(page)

  // Scenario 1: before anything is opened the control is there and has nothing to do.
  const never = await orbitSouthFrame(page, canvas)
  await expect(page.getByRole('group', { name: 'Scene objects' })).toBeVisible()
  await expect(closeControl(page)).toBeDisabled()
  await expect(closeControl(page)).toHaveAttribute('title', NOTHING_TO_CLOSE)

  // Scenario 2: the walker stops at the shut door, and the open key opens it.
  const atShut = await walkToDoor(page, canvas)
  const whole = wholeFrame(atShut)
  await expect(closeControl(page)).toBeDisabled()
  const atOpen = await openWithKey(page, canvas, atShut)
  expectDifferentView(atShut, atOpen, within(whole, 'the walker view with the door open'))
  const doorInWalk = openingRegion(atShut, atOpen)

  // Scenario 3: the door stays open in orbit mode, and one press swings it shut.
  const openSouth = await orbitSouthFrame(page, canvas)
  await expect(closeControl(page)).toBeEnabled()
  const doorInOrbit = openingRegion(never, openSouth)
  expectDifferentView(never, openSouth, within(doorInOrbit, 'the open door in orbit mode'))
  const orbitClose = await closeWithControl(page, canvas, { frame: openSouth, region: doorInOrbit })
  expect(orbitClose.between.length, 'frames that show a part-open door').toBeGreaterThan(0)
  expectSameView(orbitClose.settled, never, within(doorInOrbit, 'the door shut in orbit mode'))
  await expect(closeControl(page)).toBeDisabled()

  // Scenario 4: back in walk mode the door is shut, the walker resumes where it stood, and it
  // cannot walk through the door. The open key opens the door again.
  await enterWalk(page)
  const resumed = await frameAfterChange(canvas, orbitClose.settled)
  expectSameView(resumed, atShut, within(whole, 'the walker at its saved pose, door shut'))
  const held = await holdWalkKey(page, canvas)
  expectSameView(held, resumed, within(whole, 'the walker held against the shut door'))
  const reopened = await openWithKey(page, canvas, resumed)
  expectSameView(reopened, atOpen, within(whole, 'the door opened again with the key'))

  // Scenario 5: in walk mode the control closes the door with the same swing, and the key that
  // resets the openings agrees with it.
  const walkClose = await closeWithControl(page, canvas, { frame: reopened, region: doorInWalk })
  expect(walkClose.between.length, 'frames that show a part-open door').toBeGreaterThan(0)
  expectSameView(walkClose.settled, atShut, within(whole, 'the door shut in walk mode'))
  const openedForReset = await openWithKey(page, canvas, walkClose.settled)
  const afterReset = await resetWithKey(page, canvas, openedForReset)
  expectSameView(
    afterReset,
    walkClose.settled,
    within(whole, 'the reset key and the control agree'),
  )

  // Control for scenario 4: with the door open, the same hold carries the walker through.
  await enterOrbit(page)
  await enterWalk(page)
  const readyToPass = await openWithKey(page, canvas, await stableFrame(canvas))
  const passed = await holdWalkKey(page, canvas)
  expectDifferentView(passed, readyToPass, within(whole, 'the walker held at the open door'))
  await expect(navButton(page, 'Walk')).toBeVisible()
})

test('keeps an open door open through scene rebuilds and a view switch, and still closes it', async ({
  page,
}) => {
  await gotoEditor(page)
  await guardLiveSceneSupport(page, SUBJECT)
  const canvas = await openRoomIn3d(page)

  // The view with the door never opened and the surface edges drawn is the reference for the
  // door after the overlay rebuilds the scene.
  const neverBare = await orbitSouthFrame(page, canvas)
  const neverEdges = await toggleEdgesWhileWatching(page, canvas, {
    before: neverBare,
    region: wholeFrame(neverBare),
  })
  const { open, region } = await openDoorSeenFromOrbit(page, canvas)

  // Scenario 6: toggling the surface edges on and off rebuilds the scene twice. The door stays
  // open through both, in every frame, and the control still closes it.
  const edges = await toggleEdgesWhileWatching(page, canvas, { before: open, region })
  expectDifferentView(edges.on, neverEdges.on, within(region, 'the open door, edges on'))
  expectSameView(edges.frame, open, within(region, 'the open door, edges off again'))
  const afterEdges = await closeWithControl(page, canvas, { frame: edges.frame, region })
  expect(edges.readings.length, 'frames read during the rebuilds').toBeGreaterThan(0)
  expect(framesShowing(edges.readings, afterEdges.shut), 'frames showing the door shut').toEqual([])
  expectSameView(afterEdges.settled, neverBare, within(region, 'the door shut after the rebuilds'))

  // Scenario 7: a paint edit rebuilds every opening. The door leaf, above the painted floor,
  // stays open in every frame, and the control still closes it.
  const upper = upperPart(region)
  const openAgain = await reopenSeenFromOrbit(page, canvas)
  const paint = await paintFloorWhileWatching(page, canvas, upper)
  expectSameView(paint.frame, openAgain, within(upper, 'the door leaf after a paint edit'))
  const afterPaint = await closeWithControl(page, canvas, { frame: paint.frame, region: upper })
  expect(framesShowing(paint.readings, afterPaint.shut), 'frames showing the leaf shut').toEqual([])
  expectSameView(afterPaint.settled, neverBare, within(upper, 'the leaf shut after the paint edit'))

  // Scenario 8: going to the plan view and back mounts a new 3D canvas. The door shows open
  // from the first frame of it, and the control still closes it.
  const beforeSwitch = await reopenSeenFromOrbit(page, canvas)
  const remount = await switchViewsWhileWatching(page, region)
  expectSameView(remount.frame, beforeSwitch, within(region, 'the open door after the switch'))
  expect(remount.readings.length, 'frames read across the switch').toBeGreaterThan(0)
  await expect(closeControl(page)).toBeEnabled()
  const afterSwitch = await closeWithControl(page, canvas, { frame: remount.frame, region })
  expect(framesShowing(remount.readings, afterSwitch.shut), 'frames showing the door shut').toEqual(
    [],
  )
  // The floor was painted in scenario 7, so the shut door is compared with the painted shut view.
  expectSameView(afterSwitch.settled, afterPaint.settled, within(region, 'the door shut again'))
})

test('closes a window like a door, and a door and a window together on one press', async ({
  page,
}) => {
  await gotoEditor(page)
  await guardLiveSceneSupport(page, SUBJECT)
  const canvas = await openRoomIn3d(page)

  // The door is found first, as the box that changes when it opens, and shut again.
  const door = await openDoorSeenFromOrbit(page, canvas)
  const doorShut = await closeWithControl(page, canvas, { frame: door.open, region: door.region })
  expectSameView(doorShut.settled, door.never, within(door.region, 'the door shut first'))

  // Scenario 9: the walker strafes east to the window and opens it, and the control closes it
  // with a swing, like a door.
  await enterWalk(page)
  const windowOpen = await strafeUntilOpened(page, canvas, {
    key: 'KeyA',
    never: door.never,
    wanted: eastOf(door.region, door.never),
  })
  const windowRegion = openingRegion(door.never, windowOpen)
  expect(windowRegion.x, 'the window lies east of the door').toBeGreaterThan(
    door.region.x + door.region.w,
  )
  expectSameView(windowOpen, door.never, within(door.region, 'the door while the window is open'))
  await expect(closeControl(page)).toBeEnabled()
  const windowClose = await closeWithControl(page, canvas, {
    frame: windowOpen,
    region: windowRegion,
  })
  expect(windowClose.between.length, 'frames that show a part-open window').toBeGreaterThan(0)
  expectSameView(windowClose.settled, door.never, within(windowRegion, 'the window shut'))

  // Scenario 10: with the window open again and the door opened beyond it, one press closes
  // both in the same frames, and the whole view equals the all-shut view.
  await enterWalk(page)
  await openWithKey(page, canvas, await stableFrame(canvas))
  const bothOpen = await strafeUntilOpened(page, canvas, {
    key: 'KeyD',
    never: door.never,
    wanted: door.region,
  })
  expectDifferentView(bothOpen, door.never, within(door.region, 'the door, both open'))
  expectDifferentView(bothOpen, door.never, within(windowRegion, 'the window, both open'))
  const together = await closeTogether(page, canvas, {
    frame: bothOpen,
    first: door.region,
    second: windowRegion,
  })
  expect(together.frameCounts[0], 'readings of the door and of the window').toBe(
    together.frameCounts[1],
  )
  expect(together.framesBothBetween, 'frames with both part way at once').toBeGreaterThan(0)
  const whole = wholeFrame(door.never)
  expectSameView(together.settled, door.never, within(whole, 'both shut by one press'))
  await expect(closeControl(page)).toBeDisabled()

  // Afterwards the walker is blocked at the door, and at the window, until the key opens them.
  await enterWalk(page)
  const atShutDoor = await frameAfterChange(canvas, together.settled)
  const heldAtDoor = await holdWalkKey(page, canvas)
  expectSameView(heldAtDoor, atShutDoor, within(whole, 'the walker held at the shut door'))
  await openWithKey(page, canvas, atShutDoor)
  await strafeUntilOpened(page, canvas, {
    key: 'KeyA',
    never: door.never,
    wanted: eastOf(door.region, door.never),
  })
  await enterWalk(page)
  const atShutWindow = await resetWithKey(page, canvas, await stableFrame(canvas))
  const heldAtWindow = await holdWalkKey(page, canvas)
  expectSameView(heldAtWindow, atShutWindow, within(whole, 'the walker held at the shut window'))
  await openWithKey(page, canvas, atShutWindow)
})

test('starts a walk on a fresh page with nothing opened and the door shut', async ({ page }) => {
  await gotoEditor(page)
  await guardLiveSceneSupport(page, SUBJECT)
  const canvas = await openRoomIn3d(page)

  // Scenario 11, fresh page: the control stays disabled and the orbit view that follows the
  // walk is the view from before it.
  const never = await orbitSouthFrame(page, canvas)
  await enterWalk(page)
  await expect(closeControl(page)).toBeDisabled()
  const after = await orbitSouthFrame(page, canvas)
  expectSameView(after, never, within(wholeFrame(never), 'a walk that opened nothing'))
})

test('shows each door in the right state from the first frame of a walk', async ({ page }) => {
  await gotoEditor(page)
  await guardLiveSceneSupport(page, SUBJECT)
  const canvas = await openRoomIn3d(page)

  // The door's region in the walker's view, and what that region reads when open and shut.
  const atShut = await walkToDoor(page, canvas)
  const atOpen = await openWithKey(page, canvas, atShut)
  const region = openingRegion(atShut, atOpen)
  const openSignature = await signatureOf(page, region)
  const shutView = await resetWithKey(page, canvas, atOpen)
  const shutSignature = await signatureOf(page, region)
  await openWithKey(page, canvas, shutView)

  // Scenario 11, after orbit mode with the door open: the first walker frames show it open.
  await enterOrbit(page)
  const resumedOpen = await startWalkWhileWatching(page, canvas, region)
  expect(resumedOpen.readings.length, 'frames read as the walk started').toBeGreaterThan(0)
  expect(framesShowing(resumedOpen.readings, shutSignature), 'frames showing it shut').toEqual([])
  expectSameView(resumedOpen.frame, atOpen, within(region, 'the door leaf, open at walk start'))

  // Scenario 11, after a reset made in orbit mode: the first walker frames show it shut.
  await enterOrbit(page)
  const orbitOpen = await stableFrame(canvas)
  await closeControl(page).click()
  await expect(closeControl(page)).toBeDisabled()
  await frameAfterChange(canvas, orbitOpen)
  const resumedShut = await startWalkWhileWatching(page, canvas, region)
  expect(resumedShut.readings.length, 'frames read as the walk started').toBeGreaterThan(0)
  expect(framesShowing(resumedShut.readings, openSignature), 'frames showing it open').toEqual([])
  expectSameView(resumedShut.frame, shutView, within(region, 'the door leaf, shut at walk start'))
})
