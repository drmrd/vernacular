import { expect, type Locator, type Page } from '@playwright/test'
import { changedBox, frameDifference, padRegion, wholeFrame, type Region } from '../frame-pixels'
import {
  betweenFlags,
  framesBetween,
  signatureOf,
  startSampling,
  startSamplingTogether,
  stopSampling,
  stopSamplingTogether,
  type Signature,
} from '../region-sampler'
import { closeControl, frameAfterChange } from './close-openings-support'

// Reading frames of the live view: when two frames are equal, where an opening is, and what a
// press of the close control looks like frame by frame.

// Two frames are equal in a region when the mean channel difference stays under this many codes
// and the share of strongly changed pixels stays under the fraction. In the hand-run proof every
// pair that had to be equal differed by exactly 0, and every pair that had to differ was at
// least 4.4 apart, so the two limits sit far from both.
const EQUAL_MEAN_LIMIT = 1
const EQUAL_CHANGED_FRACTION_LIMIT = 0.005
const DIFFERENT_MEAN_FLOOR = 3

// An opening's region is the box of pixels that change when it opens, with a margin so the
// swing's edges are inside it.
const OPENING_REGION_MARGIN = 6

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

export function viewsAreEqual(a: Buffer, b: Buffer, region: Region): boolean {
  const difference = frameDifference(a, b, region)
  return (
    difference.mean < EQUAL_MEAN_LIMIT && difference.changedFraction < EQUAL_CHANGED_FRACTION_LIMIT
  )
}

export function expectSameView(a: Buffer, b: Buffer, check: ViewCheck): void {
  const difference = frameDifference(a, b, check.region)
  expect(difference.mean, `${check.what}: mean difference`).toBeLessThan(EQUAL_MEAN_LIMIT)
  expect(difference.changedFraction, `${check.what}: changed fraction`).toBeLessThan(
    EQUAL_CHANGED_FRACTION_LIMIT,
  )
}

export function expectDifferentView(a: Buffer, b: Buffer, check: ViewCheck): void {
  const { mean } = frameDifference(a, b, check.region)
  expect(mean, `${check.what}: mean difference`).toBeGreaterThan(DIFFERENT_MEAN_FLOOR)
}

// The region of an opening, found as the box of pixels that differ between its shut frame and
// its open frame, with a margin.
export function openingRegion(shut: Buffer, open: Buffer): Region {
  const box = changedBox(shut, open)
  if (box === null) throw new Error('the open frame shows no change from the shut frame')
  return padRegion(box, OPENING_REGION_MARGIN, wholeFrame(shut))
}

// The part of a frame to the east of a region, which is the right-hand side of the south view.
export function eastOf(region: Region, frame: Buffer): Region {
  const bounds = wholeFrame(frame)
  const x = region.x + region.w
  return { x, y: 0, w: bounds.w - x, h: bounds.h }
}

export function upperPart(region: Region): Region {
  return { ...region, h: Math.round(region.h * UPPER_SHARE) }
}

// What closing an opening with the control showed: the settled frame, the reading of the shut
// opening, and the readings that lay between open and shut on the way.
export interface ClosingSwing {
  readonly settled: Buffer
  readonly shut: Signature
  readonly between: Signature[]
}

// Presses the toolbar control while a sampler reads the opening's region on every frame, and
// returns the settled frame after the swing and the readings that lay between open and shut.
export async function closeWithControl(
  page: Page,
  canvas: Locator,
  open: { frame: Buffer; region: Region },
): Promise<ClosingSwing> {
  const openSignature = await signatureOf(page, open.region)
  await startSampling(page, open.region)
  await closeControl(page).click()
  await expect(closeControl(page)).toBeDisabled()
  const settled = await frameAfterChange(canvas, open.frame)
  const readings = await stopSampling(page)
  const shut = await signatureOf(page, open.region)
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
  const firstBetween = betweenFlags(firstReadings, firstOpen, firstShut)
  const secondBetween = betweenFlags(secondReadings, secondOpen, secondShut)
  const framesBothBetween = firstBetween.filter((flag, at) => flag && secondBetween[at]).length
  return { settled, framesBothBetween, frameCounts: [firstReadings.length, secondReadings.length] }
}
