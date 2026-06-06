import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent,
  type RefObject,
  type SetStateAction,
} from 'react'
import type { DrawPlanOptions } from './draw-plan'
import { computeFitViewport, contentBounds } from './fit'
import {
  panBy,
  wheelZoomFactor,
  zoomAtCursor,
  type ScreenPoint,
  type Viewport,
  type ViewportSize,
} from './viewport'

const MIDDLE_BUTTON = 1
const PRIMARY_BUTTON = 0
const FIT_TO_CONTENT_KEY = 'f'

/**
 * Position of a pointer or wheel event in the canvas backing-store coordinate
 * space. The displayed-rect offset is scaled by the backing store size over the
 * displayed CSS size, so a stretched (`rect` larger than `width`/`height`)
 * canvas still maps the cursor to the correct backing-store pixel.
 */
export function eventToCanvas(
  event: { clientX: number; clientY: number },
  canvas: HTMLCanvasElement,
): ScreenPoint {
  const rect = canvas.getBoundingClientRect()
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
  }
}

/** True when a keyboard target is a control that owns its own space/typing behavior. */
export function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName))
  )
}

/** Tracks whether the spacebar is held (outside text controls); drives spacebar-drag pan. */
function useSpaceHeld(): RefObject<boolean> {
  const spaceHeld = useRef(false)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isEditableTarget(event.target)) {
        spaceHeld.current = true
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        spaceHeld.current = false
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])
  return spaceHeld
}

/**
 * Scroll/trackpad zoom-to-cursor via a native, non-passive wheel listener, so
 * preventDefault can stop the page from scrolling/zooming while the plan zooms.
 * React's onWheel is passive by default.
 */
function useWheelZoom(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  setViewport: Dispatch<SetStateAction<Viewport>>,
): void {
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const cursor = eventToCanvas(event, canvas)
      setViewport((current) => zoomAtCursor(current, cursor, wheelZoomFactor(event.deltaY)))
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [canvasRef, setViewport])
}

export interface ViewportControls {
  panning: boolean
  onPanPointerDown: (event: PointerEvent<HTMLCanvasElement>) => boolean
  onPanPointerMove: (event: PointerEvent<HTMLCanvasElement>) => boolean
  onPanPointerUp: (event: PointerEvent<HTMLCanvasElement>) => void
}

const clientPoint = (event: PointerEvent<HTMLCanvasElement>): ScreenPoint => ({
  x: event.clientX,
  y: event.clientY,
})

/** A pan starts on a middle-button drag or a spacebar-held primary-button drag. */
function isPanGesture(
  event: PointerEvent<HTMLCanvasElement>,
  spaceHeld: RefObject<boolean>,
): boolean {
  return event.button === MIDDLE_BUTTON || (event.button === PRIMARY_BUTTON && spaceHeld.current)
}

/** Middle-mouse or spacebar-drag pan; the down/move handlers report whether they consumed the event. */
function usePanGesture(
  spaceHeld: RefObject<boolean>,
  setViewport: Dispatch<SetStateAction<Viewport>>,
): ViewportControls {
  const panOrigin = useRef<ScreenPoint | null>(null)
  const [panning, setPanning] = useState(false)

  const onPanPointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>): boolean => {
      if (!isPanGesture(event, spaceHeld)) {
        return false
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      panOrigin.current = clientPoint(event)
      setPanning(true)
      return true
    },
    [spaceHeld],
  )

  const onPanPointerMove = useCallback(
    (event: PointerEvent<HTMLCanvasElement>): boolean => {
      const origin = panOrigin.current
      if (!origin) {
        return false
      }
      const delta = { x: event.clientX - origin.x, y: event.clientY - origin.y }
      setViewport((current) => panBy(current, delta))
      panOrigin.current = clientPoint(event)
      return true
    },
    [setViewport],
  )

  const onPanPointerUp = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    if (panOrigin.current) {
      event.currentTarget.releasePointerCapture(event.pointerId)
      panOrigin.current = null
      setPanning(false)
    }
  }, [])

  return { panning, onPanPointerDown, onPanPointerMove, onPanPointerUp }
}

/**
 * Owns the browser-only camera input: spacebar-held / middle-mouse drag pan and
 * scroll/trackpad zoom-to-cursor. All the math lives in the pure viewport module
 * (`panBy`, `zoomAtCursor`, `wheelZoomFactor`); this composes the small input hooks.
 */
export function useViewportControls(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  setViewport: Dispatch<SetStateAction<Viewport>>,
): ViewportControls {
  const spaceHeld = useSpaceHeld()
  useWheelZoom(canvasRef, setViewport)
  return usePanGesture(spaceHeld, setViewport)
}

/** The content to frame and the canvas to frame it within. */
export interface FitTarget {
  walls: DrawPlanOptions['walls']
  rooms: NonNullable<DrawPlanOptions['rooms']>
  size: ViewportSize
}

/** Pressing the fit key (snap-to-fit) frames all walls and rooms within the canvas. */
export function useFitToContent(
  target: FitTarget,
  setViewport: Dispatch<SetStateAction<Viewport>>,
): void {
  const { walls, rooms, size } = target
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== FIT_TO_CONTENT_KEY || isEditableTarget(event.target)) {
        return
      }
      const points = [
        ...walls.flatMap((wall) => [wall.start, wall.end]),
        ...rooms.flatMap((room) => room.polygon),
      ]
      const bounds = contentBounds(points)
      if (bounds) {
        setViewport(computeFitViewport(bounds, size))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [walls, rooms, size, setViewport])
}
