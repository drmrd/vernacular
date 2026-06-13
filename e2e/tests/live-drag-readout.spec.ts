import { test, expect } from '@playwright/test'
import { drawWall, selectors } from './journeys/support'

// Canvas-relative offsets for the wall endpoints, expressed as fractions of the
// canvas box so the spec carries no raw pixel magic numbers. The wall sits in the
// left-centre of the plan, leaving room to the right for the move drag to travel.
const WALL_START = { x: 0.3, y: 0.3 }
const WALL_END = { x: 0.3, y: 0.6 }

// A clear, deliberate move offset in screen pixels. The exact displacement is
// incidental; what matters is that the drag travels far enough to read as a move.
const MOVE_OFFSET = { x: 120, y: 80 }

// A clear, deliberate reshape offset in screen pixels for the endpoint drag. As
// with the move offset, the precise displacement is incidental; it only needs to
// travel far enough to read as a genuine endpoint reshape.
const ENDPOINT_OFFSET = { x: 140, y: 90 }

test.describe('Live move-drag readout', () => {
  test('shows a displacement readout next to the cursor while moving a selection and clears it on release', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 1000 })
    await page.goto('/')

    const canvas = selectors.planCanvas(page)
    await expect(canvas).toBeVisible()

    const box = await canvas.boundingBox()
    if (box === null) {
      throw new Error('Floor plan canvas has no bounding box')
    }

    // Draw a single vertical wall, then confirm it landed.
    await drawWall(
      page,
      { x: box.width * WALL_START.x, y: box.height * WALL_START.y },
      { x: box.width * WALL_END.x, y: box.height * WALL_END.y },
    )
    await expect(selectors.wallCount(page, 1)).toBeVisible()

    // The editor's default tool is Select; make it active explicitly the same way the
    // other interaction specs do, so the click below selects rather than draws.
    await selectors.selectTool(page).click()

    // Locate the wall on screen through its accessibility proxy (pointer-events:none, so
    // the click reaches the canvas beneath it) and click its centre to select it. With the
    // pan-default interaction a press on an already-selected entity moves it, so selecting
    // first is what makes the drag below a move rather than a pan.
    const proxy = await selectors.wallProxy(page).boundingBox()
    if (proxy === null) {
      throw new Error('Wall accessibility proxy has no bounding box')
    }
    const wallCenter = { x: proxy.x + proxy.width / 2, y: proxy.y + proxy.height / 2 }
    await page.mouse.click(wallCenter.x, wallCenter.y)
    await expect(page.getByRole('textbox', { name: /thickness/i })).toBeVisible()

    // Start a move drag on the selected wall: press on the wall, then move by a clear
    // offset without releasing. The selection slides with the cursor as a live drag.
    await page.mouse.move(wallCenter.x, wallCenter.y)
    await page.mouse.down()
    await page.mouse.move(wallCenter.x + MOVE_OFFSET.x, wallCenter.y + MOVE_OFFSET.y, { steps: 10 })

    // While the drag is live, the displacement readout pill sits next to the cursor and
    // reads a number. We pin the behaviour, not the value: it is visible and carries a digit.
    const readout = selectors.drawReadout(page)
    await expect(readout).toBeVisible()
    await expect(readout).toHaveText(/\d/)

    // Release to end the drag. The readout is transient view state, so it clears.
    await page.mouse.up()
    await expect(readout).toHaveCount(0)
  })
})

test.describe('Live wall-endpoint readout', () => {
  test('shows the reshaped wall length and bearing next to the dragged endpoint and clears it on release', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 1000 })
    await page.goto('/')

    const canvas = selectors.planCanvas(page)
    await expect(canvas).toBeVisible()

    const box = await canvas.boundingBox()
    if (box === null) {
      throw new Error('Floor plan canvas has no bounding box')
    }

    // Draw a single vertical wall, then confirm it landed. We reuse the same
    // canvas-fraction endpoints as the move test, drawn through the shared helper.
    await drawWall(
      page,
      { x: box.width * WALL_START.x, y: box.height * WALL_START.y },
      { x: box.width * WALL_END.x, y: box.height * WALL_END.y },
    )
    await expect(selectors.wallCount(page, 1)).toBeVisible()

    // The editor's default tool is Select; make it active explicitly the same way the
    // other interaction specs do, so the click below selects rather than draws.
    await selectors.selectTool(page).click()

    // Select the wall through its accessibility proxy so its endpoint handles arm.
    const proxy = await selectors.wallProxy(page).boundingBox()
    if (proxy === null) {
      throw new Error('Wall accessibility proxy has no bounding box')
    }
    const wallCenter = { x: proxy.x + proxy.width / 2, y: proxy.y + proxy.height / 2 }
    await page.mouse.click(wallCenter.x, wallCenter.y)
    await expect(page.getByRole('textbox', { name: /thickness/i })).toBeVisible()

    // Compute the dragged endpoint's screen position from the canvas box and the
    // wall-end fraction we drew, matching how the endpoint specs target a handle:
    // press at the endpoint's absolute screen point, then move without releasing.
    const endpoint = {
      x: box.x + box.width * WALL_END.x,
      y: box.y + box.height * WALL_END.y,
    }
    await page.mouse.move(endpoint.x, endpoint.y)
    await page.mouse.down()
    await page.mouse.move(endpoint.x + ENDPOINT_OFFSET.x, endpoint.y + ENDPOINT_OFFSET.y, {
      steps: 10,
    })

    // While the endpoint drag is live, the readout pill sits next to the dragged point and
    // reads the reshaped wall's length and bearing. We pin the behaviour, not the value:
    // it is visible and carries a digit.
    const readout = selectors.drawReadout(page)
    await expect(readout).toBeVisible()
    await expect(readout).toHaveText(/\d/)

    // Release to end the drag. The readout is transient view state, so it clears.
    await page.mouse.up()
    await expect(readout).toHaveCount(0)
  })
})
