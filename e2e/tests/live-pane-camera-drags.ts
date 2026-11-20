import { expect, type Page } from '@playwright/test'
import {
  liveSceneCanvas,
  settledLiveFrame,
  waitForLiveCanvasReady,
  waitForLiveFrameDifferentFrom,
} from './live-pane-frames'

// Helpers that the live pane specs share when they steer the orbit camera of the 3D preview, read
// the frames it drew, and leave and re-enter the split view. They take the page and keep no state.

// The orbit drag: from the canvas centre by this many CSS pixels, in this many mouse moves.
export const DRAG_DX = 120
export const DRAG_DY = 40
const DRAG_STEPS = 8

// The pan: a secondary-button drag from the canvas centre by this many CSS pixels, in the same
// number of mouse moves. A pan is the one drag that moves the pivot with the camera.
const PAN_DX = 90
const PAN_DY = 50

/** A corner of a room in plan pixels. */
export type Corner = { readonly x: number; readonly y: number }

/**
 * A closed rectangular room in plan pixels (the last corner is the first again, which closes the
 * loop), drawn in the split view.
 */
export const FIRST_ROOM: readonly Corner[] = [
  { x: 100, y: 120 },
  { x: 300, y: 120 },
  { x: 300, y: 260 },
  { x: 100, y: 260 },
  { x: 100, y: 120 },
]

/** A frame with the name that the failure message uses for it. */
export interface NamedFrame {
  readonly name: string
  readonly frame: Buffer
}

/**
 * The settled frame after a change that was just requested. A change may not have drawn yet, and
 * two equal captures taken before it draws would also look settled, so the first wait is for a
 * frame that differs from the one before.
 */
export async function settledFrameAfterChange(
  page: Page,
  before: NamedFrame,
  change: string,
): Promise<Buffer> {
  await waitForLiveFrameDifferentFrom(
    page,
    before.frame,
    `${change} never changed the live 3D frame: it still matches ${before.name}`,
  )
  return settledLiveFrame(page)
}

/**
 * Plan view, where the 3D pane unmounts, then back to the split view, where it mounts again, and
 * the wait for the start-up of that new mount to end.
 */
export async function leaveAndReturn(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Plan view' }).click()
  await expect(liveSceneCanvas(page)).toHaveCount(0)
  await page.getByRole('button', { name: 'Split view' }).click()
  await waitForLiveCanvasReady(page)
}

/**
 * Drags from the canvas centre by the given offset with the given mouse button, then parks the
 * pointer away from the canvas, so no hover highlight sits on the frame that follows.
 */
export async function dragFromCanvasCentre(
  page: Page,
  button: 'left' | 'right',
  offset: { dx: number; dy: number },
): Promise<void> {
  const box = await liveSceneCanvas(page).locator('canvas').boundingBox()
  if (box === null) throw new Error('the 3D canvas has no bounding box')
  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2
  await page.mouse.move(centerX, centerY)
  await page.mouse.down({ button })
  await page.mouse.move(centerX + offset.dx, centerY + offset.dy, { steps: DRAG_STEPS })
  await page.mouse.up({ button })
  await page.mouse.move(0, 0)
}

/** Drags the orbit camera with the primary button. */
export async function dragOrbitCamera(page: Page): Promise<void> {
  await dragFromCanvasCentre(page, 'left', { dx: DRAG_DX, dy: DRAG_DY })
}

/** Pans the camera with the secondary button, which moves the orbit pivot with the camera. */
export async function panOrbitCamera(page: Page): Promise<void> {
  await dragFromCanvasCentre(page, 'right', { dx: PAN_DX, dy: PAN_DY })
}
