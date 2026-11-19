import { LIVE_SCENE_CANVAS_TEST_ID } from '../../../../bridge/react/scene-readiness'
import type { PixelSize } from '../timing-record'

/** The id of the plan canvas in index.html: 800 x 600 canvas pixels, the size the app uses. */
const PLAN_CANVAS_ID = 'plan-canvas'
/** The id of the element in index.html that the live view mounts into. */
const SCENE_HOST_ID = 'scene-host'

/**
 * The CSS size of the live view's canvas. index.html gives the live view's camera pane this size,
 * and the page checks it after each mount, so the size the record states is the size measured.
 */
export const SCENE_CANVAS_CSS_PX: PixelSize = { width: 960, height: 600 }

/** React Three Fiber's default cap of the device pixel ratio; the live view sets no other. */
const MAXIMUM_PIXEL_RATIO = 2

function elementById<Kind extends HTMLElement>(id: string, kind: new () => Kind): Kind {
  const element = document.getElementById(id)
  if (!(element instanceof kind)) throw new Error(`The timing page has no element "${id}"`)
  return element
}

/** The visible plan canvas of the page. */
export function planCanvas(): HTMLCanvasElement {
  return elementById(PLAN_CANVAS_ID, HTMLCanvasElement)
}

/** The element the live view mounts into. */
export function sceneHost(): HTMLElement {
  return elementById(SCENE_HOST_ID, HTMLElement)
}

/** The size of the drawing buffer that the live view's canvas gets at this device pixel ratio. */
export function expectedDrawingBufferPx(): PixelSize {
  const ratio = Math.min(Math.max(1, window.devicePixelRatio), MAXIMUM_PIXEL_RATIO)
  return {
    width: Math.floor(SCENE_CANVAS_CSS_PX.width * ratio),
    height: Math.floor(SCENE_CANVAS_CSS_PX.height * ratio),
  }
}

function sizeText(size: PixelSize): string {
  return `${size.width} x ${size.height}`
}

function sameSize(left: PixelSize, right: PixelSize): boolean {
  return left.width === right.width && left.height === right.height
}

/**
 * Throws when the live view's canvas does not have the CSS size and the drawing buffer that the
 * record states, so a layout change in the live view cannot pass into a record unnoticed.
 */
export function checkSceneCanvasSize(host: HTMLElement): void {
  const canvas = host.querySelector(`[data-testid="${LIVE_SCENE_CANVAS_TEST_ID}"] canvas`)
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('The live view drew no canvas, so nothing was measured')
  }
  const box = canvas.getBoundingClientRect()
  const cssPx = { width: Math.round(box.width), height: Math.round(box.height) }
  const bufferPx = { width: canvas.width, height: canvas.height }
  if (!sameSize(cssPx, SCENE_CANVAS_CSS_PX) || !sameSize(bufferPx, expectedDrawingBufferPx())) {
    throw new Error(
      `The 3D canvas is ${sizeText(cssPx)} CSS px with a ${sizeText(bufferPx)} drawing buffer, ` +
        `not ${sizeText(SCENE_CANVAS_CSS_PX)} with ${sizeText(expectedDrawingBufferPx())}, ` +
        'so the timing page no longer fits the live view and needs a fix',
    )
  }
}
