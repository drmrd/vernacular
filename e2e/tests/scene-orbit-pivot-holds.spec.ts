import { test, expect, type Page } from '@playwright/test'
import { gotoEditor } from './journeys/support'
import { navButton } from './journeys/close-openings-support'
import {
  FIRST_ROOM,
  dragOrbitCamera,
  leaveAndReturn,
  panOrbitCamera,
  settledFrameAfterChange,
  type Corner,
  type NamedFrame,
} from './live-pane-camera-drags'
import {
  settledLiveFrame,
  waitForLiveCanvasReady,
  waitForLiveFrameEqualTo,
} from './live-pane-frames'

// Issue #619: the point the 3D preview's orbit camera turns around (the pivot) must stay where the
// user put it, and a pane that the user never steered must keep framing the model. Unit tests pin
// each piece with a fake controller. These cases run the real pane, because the order of the
// effects at a real mount and the wiring of the camera rig are only proven there. They cover the
// cases that the view-switch journey (journeys/scene-view-switch-keeps-state.spec.ts) does not:
//   - a rebuild of the scene, here the Surface edges toggle, leaves a panned camera where it was;
//   - Reset view puts the pivot back on the framed centre, also after a pan, so the first drag
//     after the reset turns around the same point as the first drag from the start;
//   - a pane that was never steered still frames the model after a view switch, so a second room
//     drawn afterwards is framed like one drawn without the switch.
//
// Nothing in the page exposes the camera or the pivot as a value, so the cases read what the
// renderer drew, as the neighbouring live-view specs do: canvas-only captures compared by bytes.
// Every equality is preceded by a reading that differs (a change that was waited for), so that the
// equality means something. After each mount of the pane the cases wait for the readiness marker
// of that mount before they capture (live-pane-frames.ts says why).
//
// The file name starts with "scene-" so that the configuration routes it to the scene-webgl
// project and keeps it out of the chromium project. Like the neighbours the cases self-skip only
// without navigator.gpu. In CI only the linux job runs this file, and there the pane draws through
// three's WebGL 2 fallback. The WebGPU path runs only where someone runs the scene-webgl project
// on a development Mac, which has a real adapter.

// A second closed room beside the first one.
const SECOND_ROOM: readonly Corner[] = [
  { x: 340, y: 120 },
  { x: 480, y: 120 },
  { x: 480, y: 260 },
  { x: 340, y: 260 },
  { x: 340, y: 120 },
]

// Opens the split view on the empty floor and returns the settled frame of the empty floor.
async function openSplitView(page: Page): Promise<NamedFrame> {
  await gotoEditor(page)
  const hasWebGpu = await page.evaluate(() => 'gpu' in navigator)
  test.skip(!hasWebGpu, 'The live 3D preview requires WebGPU; self-skips without navigator.gpu.')

  await page.getByRole('button', { name: 'Split view' }).click()
  await waitForLiveCanvasReady(page)
  return { name: 'the empty floor', frame: await settledLiveFrame(page) }
}

// Draws one closed room in the plan and waits until the plan lists the given number of rooms.
async function drawRoom(
  page: Page,
  corners: readonly Corner[],
  roomsAfterwards: number,
): Promise<void> {
  const plan = page.getByLabel('Floor plan')
  await expect(plan).toBeVisible()
  await page.getByRole('radio', { name: 'Wall', exact: true }).click()
  for (const position of corners) await plan.click({ position })
  await expect(page.getByRole('option', { name: /^Room,/ })).toHaveCount(roomsAfterwards)
  // Leave the wall tool and clear the selection, so no highlight sits on the room.
  await page.getByRole('radio', { name: 'Select', exact: true }).click()
  await page.keyboard.press('Escape')
}

// Opens the split view on the empty floor, draws the first room, and returns the settled frame of
// the room. That frame differs from the empty floor, so the pane has drawn the room.
async function openDrawnRoom(page: Page): Promise<NamedFrame> {
  const empty = await openSplitView(page)
  await drawRoom(page, FIRST_ROOM, 1)
  const room = await settledFrameAfterChange(page, empty, 'drawing the room')
  return { name: 'the framed view of the room', frame: room }
}

test.describe('Live three-dimensional pane keeps its orbit pivot and its framing', () => {
  test('keeps a panned camera when the scene rebuilds', async ({ page }) => {
    test.slow()
    const room = await openDrawnRoom(page)

    await panOrbitCamera(page)
    const panned = {
      name: 'the panned camera',
      frame: await settledFrameAfterChange(page, room, 'the pan'),
    }

    // The edge overlay is a new reconciler, so each toggle rebuilds the scene. The toggle shows its
    // state in the DOM, and the overlay changes the frame, so each reading waits for both.
    const edges = navButton(page, 'Surface edges')
    await edges.click()
    await expect(edges).toHaveAttribute('aria-pressed', 'true')
    const withEdges = {
      name: 'the panned camera with the edge overlay on',
      frame: await settledFrameAfterChange(page, panned, 'the edge overlay toggle'),
    }
    await edges.click()
    await expect(edges).toHaveAttribute('aria-pressed', 'false')
    const edgesOff = await settledFrameAfterChange(page, withEdges, 'the edge overlay toggled off')

    expect(
      edgesOff.equals(panned.frame),
      `the camera moved when the scene rebuilt: the frame no longer matches ${panned.name}`,
    ).toBe(true)
  })

  test('turns the first drag after Reset view around the framed centre, also after a pan', async ({
    page,
  }) => {
    test.slow()
    const room = await openDrawnRoom(page)

    // The first drag from the framed view turns around the framed centre.
    await dragOrbitCamera(page)
    const firstDrag = {
      name: 'the orbit drag from the framed view',
      frame: await settledFrameAfterChange(page, room, 'the first orbit drag'),
    }

    await navButton(page, 'Reset view').click()
    const firstReset = {
      name: 'the view after the first reset',
      frame: await settledFrameAfterChange(page, firstDrag, 'the first Reset view'),
    }

    // A pan moves the pivot away from the framed centre. Reset view must bring it back too.
    await panOrbitCamera(page)
    const panned = {
      name: 'the panned camera',
      frame: await settledFrameAfterChange(page, firstReset, 'the pan'),
    }
    await navButton(page, 'Reset view').click()
    const secondReset = await settledFrameAfterChange(page, panned, 'the second Reset view')
    expect(
      secondReset.equals(firstReset.frame),
      `the second Reset view did not frame the model like the first: it no longer matches ${firstReset.name}`,
    ).toBe(true)

    // The same drag must now give the same frame as before the pan: a pivot left on the panned
    // point would turn the camera around another point.
    await dragOrbitCamera(page)
    const secondDrag = await settledFrameAfterChange(
      page,
      { name: 'the view after the second reset', frame: secondReset },
      'the orbit drag after the second Reset view',
    )
    expect(
      secondDrag.equals(firstDrag.frame),
      `the drag after Reset view turned around another point: the frame no longer matches ${firstDrag.name}`,
    ).toBe(true)
  })

  test('frames a second room drawn after a view switch when the user never steered the camera', async ({
    page,
    browser,
  }) => {
    test.slow()
    // The reference: both rooms drawn in one go, with no view switch.
    const room = await openDrawnRoom(page)
    await drawRoom(page, SECOND_ROOM, 2)
    const reference = await settledFrameAfterChange(page, room, 'drawing the second room')

    // The project autosaves, so a reload of the same page would bring the second room back. A new
    // context starts with its own storage.
    const context = await browser.newContext({ viewport: page.viewportSize() })
    try {
      const other = await context.newPage()
      const sameRoom = await openDrawnRoom(other)
      expect(
        sameRoom.frame.equals(room.frame),
        'the first room was framed differently in the second context',
      ).toBe(true)

      // No drag, no pan, no preset: the camera is still the automatic one.
      await leaveAndReturn(other)
      await waitForLiveFrameEqualTo(
        other,
        sameRoom.frame,
        'the view switch changed the automatic framing of the first room',
      )
      expect(
        (await settledLiveFrame(other)).equals(sameRoom.frame),
        'the view switch changed the automatic framing of the first room',
      ).toBe(true)

      await drawRoom(other, SECOND_ROOM, 2)
      const afterSwitch = await settledFrameAfterChange(
        other,
        sameRoom,
        'drawing the second room after the switch',
      )
      expect(
        afterSwitch.equals(reference),
        'a second room drawn after the view switch was not framed: the pane still counts as steered',
      ).toBe(true)
    } finally {
      await context.close()
    }
  })
})
