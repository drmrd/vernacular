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

/** The two sizes of the live view's canvas: its CSS box and its drawing buffer. */
export interface SceneCanvasSizes {
  readonly cssPx: PixelSize
  readonly drawingBufferPx: PixelSize
}

/**
 * The sizes the live view's canvas gets at this device pixel ratio, before any view has mounted:
 * what the start observation of a run states.
 */
export function expectedSceneCanvasSizes(): SceneCanvasSizes {
  const ratio = Math.min(Math.max(1, window.devicePixelRatio), MAXIMUM_PIXEL_RATIO)
  return {
    cssPx: SCENE_CANVAS_CSS_PX,
    drawingBufferPx: {
      width: Math.floor(SCENE_CANVAS_CSS_PX.width * ratio),
      height: Math.floor(SCENE_CANVAS_CSS_PX.height * ratio),
    },
  }
}

function sizeText(size: PixelSize): string {
  return `${size.width} x ${size.height}`
}

/**
 * The real sizes of the mounted live view's canvas: the CSS box of its container (the element with
 * the readiness attribute, which the canvas fills) and the canvas's drawing buffer. Throws when no
 * canvas is drawn, or when the container is not the CSS size of the page's layout, so a layout
 * change in the live view cannot pass into a record unnoticed.
 */
export function measureSceneCanvas(host: HTMLElement): SceneCanvasSizes {
  const container = host.querySelector(`[data-testid="${LIVE_SCENE_CANVAS_TEST_ID}"]`)
  const canvas = container?.querySelector('canvas')
  if (container == null || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error('The live view drew no canvas, so nothing was measured')
  }
  const box = container.getBoundingClientRect()
  const cssPx = { width: Math.round(box.width), height: Math.round(box.height) }
  if (cssPx.width !== SCENE_CANVAS_CSS_PX.width || cssPx.height !== SCENE_CANVAS_CSS_PX.height) {
    throw new Error(
      `The 3D canvas is ${sizeText(cssPx)} CSS px, not ${sizeText(SCENE_CANVAS_CSS_PX)}, ` +
        'so the timing page no longer fits the live view and needs a fix',
    )
  }
  return { cssPx, drawingBufferPx: { width: canvas.width, height: canvas.height } }
}
