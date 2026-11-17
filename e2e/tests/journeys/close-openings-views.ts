import { expect, type Locator, type Page } from '@playwright/test'
import { frameReader, padRegion, type FrameReader, type Region } from '../frame-pixels'
import { logReading } from '../scene-helpers'
import {
  SHOWING_MARGIN,
  betweenClearance,
  betweenFlags,
  closestApproach,
  framesBetween,
  framesShowing,
  signatureOf,
  startSampling,
  startSamplingTogether,
  stopSampling,
  stopSamplingTogether,
  type Signature,
} from '../region-sampler'
import { closeControl, frameAfterChange } from './close-openings-support'

// Reading frames of the live view: when two frames are equal, where an opening is, and what a
// press of the close control looks like frame by frame. Every check prints the number it
// measured next to the limit, so that a run on a new machine shows how close it came.

// Two frames are equal in a region when the mean channel difference stays under this many codes
// and the share of strongly changed pixels stays under the fraction. In the hand-run proof every
// pair that had to be equal differed by exactly 0, and every pair that had to differ was at
// least 4.4 apart, so the two limits sit far from both.
const EQUAL_MEAN_LIMIT = 1
const EQUAL_CHANGED_FRACTION_LIMIT = 0.005
const DIFFERENT_MEAN_FLOOR = 3

// An opening's region is the box of pixels that change when it opens, with a margin so the
// swing's edges are inside it.
export const OPENING_REGION_MARGIN = 6

// The upper part of a door's region holds the leaf but not the floor seen through it.
const UPPER_SHARE = 0.6

// Where a comparison looks, and what it is about, for the failure message.
export interface ViewCheck {
  readonly region: Region
  readonly what: string
}

// A comparison's region and its description, written where the comparison is made.
export function within(region: Region, what: string): ViewCheck {
  return { region, what }
}

export function upperPart(region: Region): Region {
  return { ...region, h: Math.round(region.h * UPPER_SHARE) }
}

// Comparisons of frames, read through the browser of one page.
export interface Views {
  equal(a: Buffer, b: Buffer, region: Region): Promise<boolean>
  expectSame(a: Buffer, b: Buffer, check: ViewCheck): Promise<void>
  expectDifferent(a: Buffer, b: Buffer, check: ViewCheck): Promise<void>
  // The region of an opening, found as the box of pixels that differ between its shut frame and
  // its open frame, with a margin.
  openingRegion(shut: Buffer, open: Buffer): Promise<Region>
  // The same box without the margin, for a check that one box lies inside another.
  changedBox(a: Buffer, b: Buffer, within?: Region): Promise<Region>
  whole(frame: Buffer): Promise<Region>
  // The part of a frame to the east of a region, which is the right-hand side of the south view.
  eastOf(region: Region, frame: Buffer): Promise<Region>
}

// The digits a printed reading carries.
const READING_DIGITS = 3

async function expectSame(
  reader: FrameReader,
  frames: [Buffer, Buffer],
  check: ViewCheck,
): Promise<void> {
  const { mean, changedFraction } = await reader.difference(...frames, check.region)
  logReading(
    `same, ${check.what}`,
    `mean ${mean.toFixed(READING_DIGITS)} (limit ${EQUAL_MEAN_LIMIT}), changed ${changedFraction.toFixed(READING_DIGITS)} (limit ${EQUAL_CHANGED_FRACTION_LIMIT})`,
  )
  expect(mean, `${check.what}: mean difference`).toBeLessThan(EQUAL_MEAN_LIMIT)
  expect(changedFraction, `${check.what}: changed fraction`).toBeLessThan(
    EQUAL_CHANGED_FRACTION_LIMIT,
  )
}

async function expectDifferent(
  reader: FrameReader,
  frames: [Buffer, Buffer],
  check: ViewCheck,
): Promise<void> {
  const { mean } = await reader.difference(...frames, check.region)
  logReading(
    `different, ${check.what}`,
    `mean ${mean.toFixed(READING_DIGITS)} (floor ${DIFFERENT_MEAN_FLOOR})`,
  )
  expect(mean, `${check.what}: mean difference`).toBeGreaterThan(DIFFERENT_MEAN_FLOOR)
}

export function viewsOf(page: Page): Views {
  const reader = frameReader(page)
  const whole = reader.whole
  const changedBox = async (a: Buffer, b: Buffer, within?: Region): Promise<Region> => {
    const box = await reader.changedBox(a, b, within)
    if (box === null) throw new Error('the second frame shows no change from the first frame')
    return box
  }
  return {
    whole,
    equal: async (a, b, region) => {
      const difference = await reader.difference(a, b, region)
      return (
        difference.mean < EQUAL_MEAN_LIMIT &&
        difference.changedFraction < EQUAL_CHANGED_FRACTION_LIMIT
      )
    },
    expectSame: (a, b, check) => expectSame(reader, [a, b], check),
    expectDifferent: (a, b, check) => expectDifferent(reader, [a, b], check),
    changedBox,
    openingRegion: async (shut, open) =>
      padRegion(await changedBox(shut, open), OPENING_REGION_MARGIN, await whole(shut)),
    eastOf: async (region, frame) => {
      const bounds = await whole(frame)
      const x = region.x + region.w
      return { x, y: 0, w: bounds.w - x, h: bounds.h }
    },
  }
}

// Asserts that no reading shows a state, and that there were readings to look at, so the check
// cannot pass for want of frames. Prints how close the nearest reading came.
export function expectNeverShowing(
  readings: readonly Signature[],
  state: Signature,
  what: string,
): void {
  logReading(
    `never showing, ${what}`,
    `${readings.length} frames, closest ${closestApproach(readings, state).toFixed(READING_DIGITS)} (showing at ${SHOWING_MARGIN} or less)`,
  )
  expect(readings.length, `${what}: frames read`).toBeGreaterThan(0)
  expect(framesShowing(readings, state), `${what}: frames that show it`).toEqual([])
}

// What closing an opening with the control showed: the settled frame, the reading of the shut
// opening, and the readings that lay between open and shut on the way.
export interface ClosingSwing {
  readonly settled: Buffer
  readonly shut: Signature
  readonly between: Signature[]
}

// Prints how many frames of a swing the sampler saw and how far the part-open ones stood from
// the end states. A swing lasts a quarter of a second, so a runner that draws fewer than about
// eight frames a second may see none.
function logSwing(
  what: string,
  readings: readonly Signature[],
  ends: [Signature, Signature],
): void {
  const between = framesBetween(readings, ...ends).length
  const clearance = betweenClearance(readings, ...ends).toFixed(READING_DIGITS)
  logReading(
    `swing, ${what}`,
    `${between} frames between of ${readings.length} read, clearance ${clearance} (margin ${SHOWING_MARGIN})`,
  )
}

// Presses the toolbar control while a sampler reads the opening's region on every frame, and
// returns the settled frame after the swing and the readings that lay between open and shut.
export async function closeWithControl(
  page: Page,
  canvas: Locator,
  open: { frame: Buffer; region: Region; what: string },
): Promise<ClosingSwing> {
  const openSignature = await signatureOf(page, open.region)
  await startSampling(page, open.region)
  await closeControl(page).click()
  await expect(closeControl(page)).toBeDisabled()
  const settled = await frameAfterChange(canvas, open.frame)
  const readings = await stopSampling(page)
  const shut = await signatureOf(page, open.region)
  logSwing(open.what, readings, [openSignature, shut])
  return { settled, shut, between: framesBetween(readings, openSignature, shut) }
}

// Closes two openings with one press of the control, reading each one's region on every frame.
// Returns the settled frame and how many frames showed both part way at once.
export async function closeTogether(
  page: Page,
  canvas: Locator,
  open: { frame: Buffer; first: Region; second: Region },
): Promise<{ settled: Buffer; framesBothBetween: number; frameCounts: number[] }> {
  const firstOpen = await signatureOf(page, open.first)
  const secondOpen = await signatureOf(page, open.second)
  await startSamplingTogether(page, { first: open.first, second: open.second })
  await closeControl(page).click()
  await expect(closeControl(page)).toBeDisabled()
  const settled = await frameAfterChange(canvas, open.frame)
  const [firstReadings = [], secondReadings = []] = await stopSamplingTogether(page, [
    'first',
    'second',
  ])
  const firstShut = await signatureOf(page, open.first)
  const secondShut = await signatureOf(page, open.second)
  logSwing('the door, closed with the window', firstReadings, [firstOpen, firstShut])
  logSwing('the window, closed with the door', secondReadings, [secondOpen, secondShut])
  const firstBetween = betweenFlags(firstReadings, firstOpen, firstShut)
  const secondBetween = betweenFlags(secondReadings, secondOpen, secondShut)
  const framesBothBetween = firstBetween.filter((flag, at) => flag && secondBetween[at]).length
  return { settled, framesBothBetween, frameCounts: [firstReadings.length, secondReadings.length] }
}
