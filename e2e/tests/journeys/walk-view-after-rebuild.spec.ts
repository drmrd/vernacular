import { test, expect, type Page } from '@playwright/test'
import { frameReader } from '../frame-pixels'
import { configureGpuChromiumOnMac, guardLiveSceneSupport } from '../live-webgpu'
import { logReading, stableFrame } from '../scene-helpers'
import {
  enterOrbit,
  enterWalkReady,
  frameAfterChange,
  navButton,
  openRoomIn3d,
  toggleEdges,
  walkToDoor,
} from './close-openings-support'
import { gotoEditor } from './support'

// Issue #781: the walker's view of a door looked different after the scene was rebuilt, even
// though nothing about the room had changed. The first view showed the leaf in shade, and the
// view after a rebuild showed it sunlit. This journey stands the walker at the shut door, goes
// through a rebuild in orbit mode, and walks again. The two walker frames must match.
//
// The live view renders through the non-deterministic WebGPU backend (ADR-0045), so this spec
// commits no pixel baseline. Both frames are taken in the same run and compared with each other
// over the whole canvas. It needs a real WebGPU adapter and follows the same self-skip policy as
// the other live-view journeys: it skips without one, and E2E_REQUIRE_WEBGPU=1 turns the skip
// into a failure, which the macOS live-view job sets.

configureGpuChromiumOnMac()

// Two frames of one view are equal when the mean channel difference (0..255) stays below the
// first bar and the share of strongly changed pixels stays below the second.
const EQUAL_MEAN_LIMIT = 1.0
const EQUAL_CHANGED_FRACTION_LIMIT = 0.01

// Walking to the door and settling frames takes up to about half a minute on the development
// Mac. The budget leaves a wide margin for a slower runner.
const TEST_TIMEOUT_MS = 120_000

const READING_DIGITS = 3

// Reads the two frames over the whole canvas, prints the reading, and expects them to be equal.
async function expectSameView(
  page: Page,
  label: string,
  frames: { first: Buffer; second: Buffer },
): Promise<void> {
  const reader = frameReader(page)
  const { mean, changedFraction } = await reader.difference(
    frames.first,
    frames.second,
    await reader.whole(frames.first),
  )
  logReading(
    label,
    `mean ${mean.toFixed(READING_DIGITS)} (limit ${EQUAL_MEAN_LIMIT}), changed ${changedFraction.toFixed(READING_DIGITS)} (limit ${EQUAL_CHANGED_FRACTION_LIMIT})`,
  )
  expect(mean, 'mean channel difference over the whole canvas').toBeLessThan(EQUAL_MEAN_LIMIT)
  expect(changedFraction, 'fraction of changed pixels over the whole canvas').toBeLessThan(
    EQUAL_CHANGED_FRACTION_LIMIT,
  )
}

test('shows the walker the same view of the shut door after a scene rebuild', async ({ page }) => {
  test.setTimeout(TEST_TIMEOUT_MS)
  await gotoEditor(page)
  await guardLiveSceneSupport(page, 'the walk-view-after-rebuild journey')
  const canvas = await openRoomIn3d(page)

  // The walker stands at the shut door on the north wall. This is the first scene build's view.
  const before = await walkToDoor(page, canvas)

  // A person goes back to orbit mode and turns the surface edges on and then off. Each switch
  // rebuilds the scene while the orbit camera still stands at the walker's pose outside the
  // north wall.
  await enterOrbit(page)
  const inOrbit = await stableFrame(canvas)
  const withEdges = await toggleEdges(page, canvas, inOrbit)
  await toggleEdges(page, canvas, withEdges)

  // The walker resumes at its saved pose, so the view is the one it left.
  const after = await enterWalkReady(page, canvas)

  await expectSameView(page, 'same, the walker at the shut door before and after a scene rebuild', {
    first: before,
    second: after,
  })
})

// The same fix has a larger effect than the walker's view. A wall whose first draw was solid
// built its shader program opaque, so it stayed solid when the orbit camera later moved outside
// it. This journey builds the scene from the default south-east camera, where the north wall is
// solid at its first draw, moves the camera to the north, and rebuilds the scene again. A wall
// that fades when the camera moves outside it looks the same in both frames.
test('fades a wall that was solid at its first draw when the camera moves outside it', async ({
  page,
}) => {
  test.setTimeout(TEST_TIMEOUT_MS)
  await gotoEditor(page)
  await guardLiveSceneSupport(page, 'the walk-view-after-rebuild journey')
  const canvas = await openRoomIn3d(page)

  // A rebuild from the default camera: the north wall is drawn solid, and its program stays so.
  const fromSouthEast = await stableFrame(canvas)
  const withEdges = await toggleEdges(page, canvas, fromSouthEast)
  const rebuilt = await toggleEdges(page, canvas, withEdges)

  // The camera moves outside the north wall, which is where the wall must fade.
  await navButton(page, 'North').click()
  const frameA = await frameAfterChange(canvas, rebuilt)

  // A rebuild from the north draws the wall faded at its first draw.
  const northWithEdges = await toggleEdges(page, canvas, frameA)
  const frameB = await toggleEdges(page, canvas, northWithEdges)

  await expectSameView(
    page,
    'same, the north wall seen from the north before and after a scene rebuild',
    { first: frameA, second: frameB },
  )
})

// Issue #903: a wall of a room drawn step by step stayed solid from outside until a full rebuild.
// This journey differs from the one above in that it makes no rebuild before the North preset, so
// the wall's materials are the ones that the step-by-step builds made. A wall that fades when the
// camera moves outside it looks the same before and after the rebuild that follows.
test('fades the north wall of a room drawn step by step when the camera moves outside it', async ({
  page,
}) => {
  test.setTimeout(TEST_TIMEOUT_MS)
  await gotoEditor(page)
  await guardLiveSceneSupport(page, 'the walk-view-after-rebuild journey')
  const canvas = await openRoomIn3d(page)

  // The default south-east camera, with no rebuild of the scene yet.
  const fromSouthEast = await stableFrame(canvas)

  // The camera moves outside the north wall, which is where the wall must fade.
  await navButton(page, 'North').click()
  const frameA = await frameAfterChange(canvas, fromSouthEast)

  // A rebuild from the north draws the wall faded at its first draw.
  const northWithEdges = await toggleEdges(page, canvas, frameA)
  const frameB = await toggleEdges(page, canvas, northWithEdges)

  await expectSameView(
    page,
    'same, the north wall of a room drawn step by step seen from the north before and after a scene rebuild',
    { first: frameA, second: frameB },
  )
})
