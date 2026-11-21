import { test, expect } from '@playwright/test'
import { stableFrame } from '../scene-helpers'
import { signatureOf } from '../region-sampler'
import { configureGpuChromiumOnMac } from '../live-webgpu'
import {
  closeControl,
  closeWithKey,
  enterOrbit,
  enterWalk,
  enterWalkReady,
  frameAfterChange,
  holdWalkKey,
  navButton,
  openWithKey,
  orbitSouthFrame,
  resetWithKey,
  walkToDoor,
} from './close-openings-support'
import {
  closeTogether,
  closeWithControl,
  expectNeverShowing,
  upperPart,
  within,
} from './close-openings-views'
import { checkHungWindowSashes } from './close-openings-window'
import {
  openDoorSeenFromOrbit,
  paintFloorWhileWatching,
  reopenSeenFromOrbit,
  shutReadingWithEdges,
  startOnLiveRoom,
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
// What it proves about frames: no frame that the sampler read shows an opening in the wrong
// state. It does not prove that the sampler reads every frame the page draws. Blank readings
// from a canvas that has not drawn yet are dropped, and the check after the view switch rests
// on only a few drawn readings (the run prints the counts). A flash of the wrong state that falls
// between two reads would escape it, which issue #778 tracks.
//
// The last window scenario is about the hung window of issue #792. It selects the shut window
// through the list of 3D entities, which draws an outline around its frame, and checks that
// nothing of the open window appears outside that outline, that the open window does not flicker,
// and that a second press of the open key from the pose that opened it shuts the window again.
// The door scenario checks the same second press (issue #817).
// The outline check does not show that only the lower sash rises, because the wall hides the
// parts above the head. The unit tests in engine/scene/opening-motion.test.ts guard that.
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

// A whole test takes up to about half a minute on the development Mac, most of it walking to the
// door and settling frames. The budget leaves a wide margin for a slower runner, and it sits
// above the walk's own timeout, so that timeout can fail with its own message first.
const TEST_TIMEOUT_MS = 120_000
test.beforeEach(() => {
  test.setTimeout(TEST_TIMEOUT_MS)
})

const SUBJECT = 'the close-doors-and-windows journey'
const NOTHING_TO_CLOSE = 'Nothing to close. Open a door or window in walk mode with the E key.'

test('closes a door opened in walk mode from the 3D toolbar, in orbit mode and in walk mode', async ({
  page,
}) => {
  const { canvas, views } = await startOnLiveRoom(page, SUBJECT)

  // Scenario 1: before anything is opened the control is there and has nothing to do.
  const never = await orbitSouthFrame(page, canvas)
  await expect(page.getByRole('group', { name: 'Scene objects' })).toBeVisible()
  await expect(closeControl(page)).toBeDisabled()
  await expect(closeControl(page)).toHaveAttribute('title', NOTHING_TO_CLOSE)

  // Scenario 2: the walker stops at the shut door, and the open key opens it.
  const atShut = await walkToDoor(page, canvas)
  const whole = await views.whole(atShut)
  await expect(closeControl(page)).toBeDisabled()
  const atOpen = await openWithKey(page, canvas, atShut)
  await views.expectDifferent(atShut, atOpen, within(whole, 'the walker view with the door open'))
  const doorInWalk = await views.openingRegion(atShut, atOpen)
  const shutByKey = await closeWithKey(page, canvas, atOpen)
  await views.expectSame(shutByKey, atShut, within(whole, 'the door shut by a second open key'))
  await openWithKey(page, canvas, shutByKey)

  // Scenario 3: the door stays open in orbit mode, and one press swings it shut.
  const openSouth = await orbitSouthFrame(page, canvas)
  await expect(closeControl(page)).toBeEnabled()
  const doorInOrbit = await views.openingRegion(never, openSouth)
  await views.expectDifferent(never, openSouth, within(doorInOrbit, 'the open door in orbit mode'))
  const orbitClose = await closeWithControl(page, canvas, {
    frame: openSouth,
    region: doorInOrbit,
    what: 'the door in orbit mode',
  })
  expect(orbitClose.between.length, 'frames that show a part-open door').toBeGreaterThan(0)
  await views.expectSame(
    orbitClose.settled,
    never,
    within(doorInOrbit, 'the door shut in orbit mode'),
  )
  await expect(closeControl(page)).toBeDisabled()

  // Scenario 4: back in walk mode the door is shut, the walker resumes where it stood, and it
  // cannot walk through the door. The open key opens the door again.
  const resumed = await enterWalkReady(page, canvas)
  await views.expectSame(resumed, atShut, within(whole, 'the walker at its saved pose, door shut'))
  const held = await holdWalkKey(page, canvas)
  await views.expectSame(held, resumed, within(whole, 'the walker held against the shut door'))
  const reopened = await openWithKey(page, canvas, resumed)
  await views.expectSame(reopened, atOpen, within(whole, 'the door opened again with the key'))

  // Scenario 5: in walk mode the control closes the door with the same swing, and the key that
  // resets the openings agrees with it.
  const walkClose = await closeWithControl(page, canvas, {
    frame: reopened,
    region: doorInWalk,
    what: 'the door in walk mode',
  })
  expect(walkClose.between.length, 'frames that show a part-open door').toBeGreaterThan(0)
  await views.expectSame(walkClose.settled, atShut, within(whole, 'the door shut in walk mode'))
  const openedForReset = await openWithKey(page, canvas, walkClose.settled)
  const afterReset = await resetWithKey(page, canvas, openedForReset)
  await views.expectSame(
    afterReset,
    walkClose.settled,
    within(whole, 'the reset key and the control agree'),
  )

  // Control for scenario 4: with the door open, the same hold carries the walker through.
  await enterOrbit(page)
  const standing = await enterWalkReady(page, canvas)
  const readyToPass = await openWithKey(page, canvas, standing)
  const passed = await holdWalkKey(page, canvas)
  await views.expectDifferent(
    passed,
    readyToPass,
    within(whole, 'the walker held at the open door'),
  )
  await expect(navButton(page, 'Walk')).toBeVisible()
})

test('keeps an open door open through scene rebuilds and a view switch, and still closes it', async ({
  page,
}) => {
  const { canvas, views } = await startOnLiveRoom(page, SUBJECT)

  // The view with the door never opened and the surface edges drawn is the reference for the
  // door after the overlay rebuilds the scene.
  const neverBare = await orbitSouthFrame(page, canvas)
  const neverEdges = await toggleEdgesWhileWatching(page, canvas, {
    before: neverBare,
    region: await views.whole(neverBare),
  })
  const { open, region } = await openDoorSeenFromOrbit(page, canvas)

  // Scenario 6: toggling the surface edges on and off rebuilds the scene twice. The door stays
  // open through both, in every frame, and the control still closes it.
  const edges = await toggleEdgesWhileWatching(page, canvas, { before: open, region })
  await views.expectDifferent(edges.on, neverEdges.on, within(region, 'the open door, edges on'))
  await views.expectSame(edges.frame, open, within(region, 'the open door, edges off again'))
  const afterEdges = await closeWithControl(page, canvas, {
    frame: edges.frame,
    region,
    what: 'the door after the rebuilds',
  })
  // The first rebuild draws the door with the edges on, so a shut flash in it looks like the
  // shut door with the edges on, which is read now that the door is shut.
  const shutWithEdges = await shutReadingWithEdges(page, canvas, {
    shut: afterEdges.settled,
    region,
  })
  expectNeverShowing(edges.readings, afterEdges.shut, 'the door through the rebuilds, edges off')
  expectNeverShowing(edges.readings, shutWithEdges, 'the door through the rebuilds, edges on')
  await views.expectSame(
    afterEdges.settled,
    neverBare,
    within(region, 'the door shut after the rebuilds'),
  )

  // Scenario 7: a paint edit rebuilds every opening. The door leaf, above the painted floor,
  // stays open in every frame, and the control still closes it.
  const upper = upperPart(region)
  const openAgain = await reopenSeenFromOrbit(page, canvas)
  const paint = await paintFloorWhileWatching(page, canvas, upper)
  await views.expectSame(paint.frame, openAgain, within(upper, 'the door leaf after a paint edit'))
  const afterPaint = await closeWithControl(page, canvas, {
    frame: paint.frame,
    region: upper,
    what: 'the door leaf after the paint edit',
  })
  expectNeverShowing(paint.readings, afterPaint.shut, 'the door leaf through the paint edit')
  await views.expectSame(
    afterPaint.settled,
    neverBare,
    within(upper, 'the leaf shut after the paint edit'),
  )

  // Scenario 8: going to the plan view and back mounts a new 3D canvas. No frame read across
  // the switch shows the door shut, the settled view shows it open, and the control still
  // closes it.
  const beforeSwitch = await reopenSeenFromOrbit(page, canvas)
  const remount = await switchViewsWhileWatching(page, region)
  await views.expectSame(
    remount.frame,
    beforeSwitch,
    within(region, 'the open door after the switch'),
  )
  await expect(closeControl(page)).toBeEnabled()
  const afterSwitch = await closeWithControl(page, canvas, {
    frame: remount.frame,
    region,
    what: 'the door after the view switch',
  })
  expectNeverShowing(remount.readings, afterSwitch.shut, 'the door across the view switch')
  // The floor was painted in scenario 7, so the shut door is compared with the painted shut view.
  await views.expectSame(
    afterSwitch.settled,
    afterPaint.settled,
    within(region, 'the door shut again'),
  )
})

test('closes a window like a door, and a door and a window together on one press', async ({
  page,
}) => {
  const { canvas, views } = await startOnLiveRoom(page, SUBJECT)

  // The door is found first, as the box that changes when it opens, and shut again.
  const door = await openDoorSeenFromOrbit(page, canvas)
  const doorShut = await closeWithControl(page, canvas, {
    frame: door.open,
    region: door.region,
    what: 'the door before the window opens',
  })
  await views.expectSame(doorShut.settled, door.never, within(door.region, 'the door shut first'))

  // Scenario 9: the walker strafes east to the window and opens it, and the control closes it
  // with a swing, like a door.
  await enterWalkReady(page, canvas)
  const windowOpen = await strafeUntilOpened(page, canvas, {
    key: 'KeyA',
    never: door.never,
    wanted: await views.eastOf(door.region, door.never),
    otherOpen: false,
  })
  const windowRegion = await views.openingRegion(door.never, windowOpen)
  expect(windowRegion.x, 'the window lies east of the door').toBeGreaterThan(
    door.region.x + door.region.w,
  )
  await views.expectSame(
    windowOpen,
    door.never,
    within(door.region, 'the door while the window is open'),
  )
  await expect(closeControl(page)).toBeEnabled()
  const windowClose = await closeWithControl(page, canvas, {
    frame: windowOpen,
    region: windowRegion,
    what: 'the window',
  })
  expect(windowClose.between.length, 'frames that show a part-open window').toBeGreaterThan(0)
  await views.expectSame(windowClose.settled, door.never, within(windowRegion, 'the window shut'))

  // Scenario 10: with the window open again and the door opened beyond it, one press closes
  // both in the same frames, and the whole view equals the all-shut view.
  const atWindow = await enterWalkReady(page, canvas)
  await openWithKey(page, canvas, atWindow)
  const bothOpen = await strafeUntilOpened(page, canvas, {
    key: 'KeyD',
    never: door.never,
    wanted: door.region,
    otherOpen: true,
  })
  await views.expectDifferent(bothOpen, door.never, within(door.region, 'the door, both open'))
  await views.expectDifferent(bothOpen, door.never, within(windowRegion, 'the window, both open'))
  const together = await closeTogether(page, canvas, {
    frame: bothOpen,
    first: door.region,
    second: windowRegion,
  })
  expect(
    together.frameCounts[0],
    'the door and the window are read in the same frames, so their readings pair up by index',
  ).toBe(together.frameCounts[1])
  expect(together.framesBothBetween, 'frames with both part way at once').toBeGreaterThan(0)
  const whole = await views.whole(door.never)
  await views.expectSame(together.settled, door.never, within(whole, 'both shut by one press'))
  await expect(closeControl(page)).toBeDisabled()

  // Afterwards the walker is blocked at the door, and at the window, until the key opens them.
  const atShutDoor = await enterWalkReady(page, canvas)
  const heldAtDoor = await holdWalkKey(page, canvas)
  await views.expectSame(heldAtDoor, atShutDoor, within(whole, 'the walker held at the shut door'))
  await openWithKey(page, canvas, atShutDoor)
  await strafeUntilOpened(page, canvas, {
    key: 'KeyA',
    never: door.never,
    wanted: await views.eastOf(door.region, door.never),
    otherOpen: true,
  })
  const atOpenWindow = await enterWalkReady(page, canvas)
  const atShutWindow = await resetWithKey(page, canvas, atOpenWindow)
  const heldAtWindow = await holdWalkKey(page, canvas)
  await views.expectSame(
    heldAtWindow,
    atShutWindow,
    within(whole, 'the walker held at the shut window'),
  )
  await openWithKey(page, canvas, atShutWindow)
})

test('keeps the sashes of an open hung window inside its frame, and reaches it again with the open key', async ({
  page,
}) => {
  const { canvas } = await startOnLiveRoom(page, SUBJECT)
  await checkHungWindowSashes(page, canvas)
})

test('starts a walk on a fresh page with nothing opened and the door shut', async ({ page }) => {
  const { canvas, views } = await startOnLiveRoom(page, SUBJECT)

  // Scenario 11, fresh page: the control stays disabled and the orbit view that follows the
  // walk is the view from before it.
  const never = await orbitSouthFrame(page, canvas)
  await enterWalk(page)
  await expect(closeControl(page)).toBeDisabled()
  const after = await orbitSouthFrame(page, canvas)
  await views.expectSame(
    after,
    never,
    within(await views.whole(never), 'a walk that opened nothing'),
  )
})

test('shows each door in the right state in the frames read as a walk starts', async ({ page }) => {
  const { canvas, views } = await startOnLiveRoom(page, SUBJECT)

  // The door's region in the walker's view, and what that region reads when open and shut.
  const atShut = await walkToDoor(page, canvas)
  const atOpen = await openWithKey(page, canvas, atShut)
  const region = await views.openingRegion(atShut, atOpen)
  const openSignature = await signatureOf(page, region)
  const shutView = await resetWithKey(page, canvas, atOpen)
  const shutSignature = await signatureOf(page, region)
  await openWithKey(page, canvas, shutView)

  // Scenario 11, after orbit mode with the door open: no walker frame read as the walk starts shows it shut.
  await enterOrbit(page)
  const resumedOpen = await startWalkWhileWatching(page, canvas, region)
  expectNeverShowing(resumedOpen.readings, shutSignature, 'the door as the walk resumes, open')
  await views.expectSame(
    resumedOpen.frame,
    atOpen,
    within(region, 'the door leaf, open at walk start'),
  )

  // Scenario 11, after a reset made in orbit mode: no walker frame read as the walk starts shows it open.
  await enterOrbit(page)
  const orbitOpen = await stableFrame(canvas)
  await closeControl(page).click()
  await expect(closeControl(page)).toBeDisabled()
  await frameAfterChange(canvas, orbitOpen)
  const resumedShut = await startWalkWhileWatching(page, canvas, region)
  expectNeverShowing(resumedShut.readings, openSignature, 'the door as the walk resumes, shut')
  await views.expectSame(
    resumedShut.frame,
    shutView,
    within(region, 'the door leaf, shut at walk start'),
  )
})
