import { test, expect } from '@playwright/test'
import { frameReader } from '../frame-pixels'
import { configureGpuChromiumOnMac, guardLiveSceneSupport } from '../live-webgpu'
import { logReading, stableFrame } from '../scene-helpers'
import {
  enterOrbit,
  enterWalkReady,
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

  const reader = frameReader(page)
  const { mean, changedFraction } = await reader.difference(
    before,
    after,
    await reader.whole(before),
  )
  logReading(
    'same, the walker at the shut door before and after a scene rebuild',
    `mean ${mean.toFixed(READING_DIGITS)} (limit ${EQUAL_MEAN_LIMIT}), changed ${changedFraction.toFixed(READING_DIGITS)} (limit ${EQUAL_CHANGED_FRACTION_LIMIT})`,
  )
  expect(mean, 'mean channel difference over the whole canvas').toBeLessThan(EQUAL_MEAN_LIMIT)
  expect(changedFraction, 'fraction of changed pixels over the whole canvas').toBeLessThan(
    EQUAL_CHANGED_FRACTION_LIMIT,
  )
})
