import { test, expect, type Locator, type Page } from '@playwright/test'
import { configureGpuChromiumOnMac } from '../live-webgpu'
import { stableFrame } from '../scene-helpers'
import type { Region } from '../frame-pixels'
import {
  enterOrbit,
  enterWalkReady,
  expectSameView,
  frameAfterChange,
  navButton,
  strafe,
  walkToDoor,
} from './close-openings-support'
import { startOnLiveRoom } from './close-openings-flows'
import type { Views } from './close-openings-views'

// Issue #389: in walk mode a small dot marks the middle of the view, and an outline follows the
// opening that the open key would act on. One "Aim guide" toggle in the 3D toolbar turns both
// off and on. The dot is an element of the pane, and the outline is drawn by the frame callback
// of the live canvas, which a jsdom test cannot run.
//
// The live view renders through the non-deterministic WebGPU backend (ADR-0045), so this spec
// commits no pixel baseline. Frames taken in the same run at the same pose are compared with
// each other: a change between the guide on and the guide off is the guide. It needs a real
// WebGPU adapter and follows the same self-skip policy as the other live-view journeys: it
// skips without one, and E2E_REQUIRE_WEBGPU=1 turns the skip into a failure, which the macOS
// live-view job sets.

configureGpuChromiumOnMac()

// The tests share one GPU adapter, and a frame read while another page renders is slower and
// noisier, so they run one after another in a single worker.
test.describe.configure({ mode: 'default' })

// Walking to the door and settling frames takes up to about half a minute on the development
// Mac. The budget leaves a wide margin for a slower runner.
const TEST_TIMEOUT_MS = 120_000
test.beforeEach(() => {
  test.setTimeout(TEST_TIMEOUT_MS)
})

const SUBJECT = 'the aim-guide-in-walk-mode journey'
const TOGGLE_NAME = 'Aim guide'
const BACK_KEY = 'KeyS'

// How far each pulse of the back key takes the walker from the door, and how many pulses the
// search for a pose in reach of the door makes. At the door the frame edges lie outside the view.
const PULSE_MS = 100
const MAX_PULSES = 4
// The walker holds the back key this long to stand out of reach of the door.
const OUT_OF_REACH_MS = 1_000
// The dot with its keyline is 8 pixels across. A changed box at least this wide or tall holds
// more than the dot, which is the outline of the door.
const OUTLINE_SPAN_PX = 80
// The tolerance of the box of the dot, for the rounding of a box that sits between pixels.
const DOT_MARGIN_PX = 2
const CENTER_TOLERANCE_PX = 1

function toggle(page: Page): Locator {
  return navButton(page, TOGGLE_NAME)
}

function dot(page: Page): Locator {
  return page.locator('.aim-reticle')
}

async function boxOf(locator: Locator): Promise<Region> {
  const box = await locator.boundingBox()
  if (box === null) throw new Error('the element has no bounding box')
  return { x: box.x, y: box.y, w: box.width, h: box.height }
}

// The frame with the guide on, then the frame with it off, at one pose. Leaves the guide on.
async function guideOnAndOff(
  page: Page,
  canvas: Locator,
): Promise<{ on: Buffer; off: Buffer; backOn: Buffer }> {
  const on = await stableFrame(canvas)
  await toggle(page).click()
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false')
  const off = await frameAfterChange(canvas, on)
  await toggle(page).click()
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true')
  const backOn = await frameAfterChange(canvas, off)
  return { on, off, backOn }
}

test('shows the aim dot at the middle of the walk view and hides it with the aim guide toggle', async ({
  page,
}) => {
  const { canvas } = await startOnLiveRoom(page, SUBJECT)

  await expect(dot(page)).toHaveCount(0)
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true')

  await enterWalkReady(page, canvas)
  await expect(dot(page)).toBeVisible()
  const dotBox = await boxOf(dot(page))
  const canvasBox = await boxOf(canvas)
  expect(Math.abs(dotBox.x + dotBox.w / 2 - (canvasBox.x + canvasBox.w / 2))).toBeLessThanOrEqual(
    CENTER_TOLERANCE_PX,
  )
  expect(Math.abs(dotBox.y + dotBox.h / 2 - (canvasBox.y + canvasBox.h / 2))).toBeLessThanOrEqual(
    CENTER_TOLERANCE_PX,
  )

  await toggle(page).click()
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false')
  await expect(dot(page)).toHaveCount(0)

  await toggle(page).click()
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(dot(page)).toBeVisible()

  await enterOrbit(page)
  await expect(dot(page)).toHaveCount(0)
})

// Steps back from the door in short pulses until turning the guide off changes a box that is
// wider or taller than the dot, which is the outline of the door showing. Returns the frames of
// that pose, or null when no pulse reached such a pose.
async function stepBackUntilOutlined(
  page: Page,
  canvas: Locator,
  views: Views,
): Promise<{ on: Buffer; backOn: Buffer } | null> {
  for (let pulse = 0; pulse < MAX_PULSES; pulse++) {
    await strafe(page, BACK_KEY, PULSE_MS)
    const frames = await guideOnAndOff(page, canvas)
    const box = await views.changedBox(frames.on, frames.off)
    if (box.w >= OUTLINE_SPAN_PX || box.h >= OUTLINE_SPAN_PX) return frames
  }
  return null
}

test('outlines the door in reach and clears the outline when the guide is off or nothing is in reach', async ({
  page,
}) => {
  const { canvas, views } = await startOnLiveRoom(page, SUBJECT)
  await walkToDoor(page, canvas)

  const outlined = await stepBackUntilOutlined(page, canvas, views)
  expect(outlined, 'a pose within reach of the door that shows its outline').not.toBeNull()
  if (outlined === null) return
  await expectSameView(page, 'the guide back on at the outlined pose', {
    first: outlined.on,
    second: outlined.backOn,
  })

  await strafe(page, BACK_KEY, OUT_OF_REACH_MS)
  const farther = await guideOnAndOff(page, canvas)
  const changed = await views.changedBox(farther.on, farther.off)
  const canvasBox = await boxOf(canvas)
  const dotBox = await boxOf(dot(page))
  const inCanvas = {
    left: dotBox.x - canvasBox.x - DOT_MARGIN_PX,
    top: dotBox.y - canvasBox.y - DOT_MARGIN_PX,
    right: dotBox.x - canvasBox.x + dotBox.w + DOT_MARGIN_PX,
    bottom: dotBox.y - canvasBox.y + dotBox.h + DOT_MARGIN_PX,
  }
  expect(changed.x, 'the change starts at the dot').toBeGreaterThanOrEqual(inCanvas.left)
  expect(changed.y, 'the change starts at the dot').toBeGreaterThanOrEqual(inCanvas.top)
  expect(changed.x + changed.w, 'the change ends at the dot').toBeLessThanOrEqual(inCanvas.right)
  expect(changed.y + changed.h, 'the change ends at the dot').toBeLessThanOrEqual(inCanvas.bottom)
})
