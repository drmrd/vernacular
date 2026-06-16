import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react'
import {
  applyCalibration,
  calibrateUnderlay,
  calibrationScale,
  parseLength,
  UNDERLAY_NODE_PREFIX,
  type AssumedUnit,
  type Point,
  type SceneGraph,
  type UnderlayPlacement,
  type UnderlaySceneNode,
  type UnitSystem,
} from '../../core'
import { useAssetCache, useEditorSession, useSceneGraph, type EditorSession } from '../../bridge'
import { useActiveTool, type ActiveToolValue, type ToolId } from '../tools/active-tool-context'
import type { PreviewSegment } from './draw-plan'
import type { DrawableUnderlay } from './draw-underlay'
import { useLoadImage } from './use-load-underlay-image'
import { useResolveUnderlaysOnOpen } from './use-resolve-underlays'
import {
  advanceCalibrationTool,
  calibrationPreviewSegment,
  IDLE_CALIBRATION_TOOL,
  type CalibrationToolState,
} from './calibration-tool'
import { eventToCanvas } from './use-viewport-controls'
import { screenToWorld, type Viewport } from './viewport'

// The decoded-bitmap cache and the calibration arming live only in memory for
// the editing session. The underlay's source bytes are persisted through the
// AssetCache on load and re-decoded into this cache on open (ADR-0042), so a
// placed underlay survives a reload; the decoded bitmaps themselves are not
// persisted (they re-decode from the content-addressed bytes).
type BitmapCache = Map<string, ImageBitmap>

export interface UnderlayContextValue {
  /** Open a file picker, decode the chosen image, cache it, and place it on the active floor. */
  loadImage: () => void
  /** Arm the calibration tool against a specific underlay and switch the active tool to 'calibrate'. */
  startCalibration: (underlayId: string) => void
  /** The underlay id the calibration tool currently targets, or null when nothing is armed. */
  armedUnderlayId: string | null
  /** The two-click calibration measurement state. */
  calibrationToolState: CalibrationToolState
  setCalibrationToolState: (state: CalibrationToolState) => void
  /** Pair each underlay scene node on the floor with its cached bitmap; skip nodes whose bitmap is not yet decoded. */
  resolveDrawables: (graph: SceneGraph, floorId: string | undefined) => DrawableUnderlay[]
}

const NO_DRAWABLES: DrawableUnderlay[] = []

// A missing provider yields safe no-ops so a bare PlanView render (for example a
// story or an isolated test mount) does not throw; the editor shell always
// provides the real context.
const FALLBACK_VALUE: UnderlayContextValue = {
  loadImage: () => {},
  startCalibration: () => {},
  armedUnderlayId: null,
  calibrationToolState: IDLE_CALIBRATION_TOOL,
  setCalibrationToolState: () => {},
  resolveDrawables: () => NO_DRAWABLES,
}

const UnderlayContext = createContext<UnderlayContextValue | null>(null)

export function useUnderlay(): UnderlayContextValue {
  return useContext(UnderlayContext) ?? FALLBACK_VALUE
}

interface CalibrationArming {
  armedUnderlayId: string | null
  calibrationToolState: CalibrationToolState
  setCalibrationToolState: (state: CalibrationToolState) => void
  startCalibration: (underlayId: string) => void
}

function useCalibrationArming(activeTool: ActiveToolValue): CalibrationArming {
  const [armedUnderlayId, setArmedUnderlayId] = useState<string | null>(null)
  const [calibrationToolState, setCalibrationToolState] =
    useState<CalibrationToolState>(IDLE_CALIBRATION_TOOL)
  const { setTool } = activeTool

  const startCalibration = useCallback(
    (underlayId: string) => {
      setArmedUnderlayId(underlayId)
      setCalibrationToolState(IDLE_CALIBRATION_TOOL)
      setTool('calibrate')
    },
    [setTool],
  )

  // Memoize the bundle so consumers (the provider's context-value memo) see a
  // stable reference across renders that do not change the armed underlay or the
  // measurement state. setCalibrationToolState and startCalibration are stable.
  return useMemo(
    () => ({ armedUnderlayId, calibrationToolState, setCalibrationToolState, startCalibration }),
    [armedUnderlayId, calibrationToolState, startCalibration],
  )
}

// Pair each underlay node on the floor with its decoded bitmap; a node whose
// bitmap has not finished decoding is skipped so a half-loaded image never
// reaches drawImage.
function resolveDrawablesFrom(
  cache: BitmapCache,
  graph: SceneGraph,
  floorId: string | undefined,
): DrawableUnderlay[] {
  const drawables: DrawableUnderlay[] = []
  for (const node of graph.underlays) {
    if (node.floorId !== floorId) {
      continue
    }
    const image =
      node.source.kind === 'raster' ? cache.get(node.source.image.contentHash) : undefined
    if (image) {
      drawables.push({ node, image })
    }
  }
  // Reuse the shared empty array so a floor with no drawables yields a stable
  // reference, sparing the plan redraw an unrelated repaint.
  return drawables.length > 0 ? drawables : NO_DRAWABLES
}

export interface UnderlayProviderProps {
  children: ReactNode
}

export function UnderlayProvider({ children }: UnderlayProviderProps) {
  const session = useEditorSession()
  const activeTool = useActiveTool()
  const assets = useAssetCache()
  const graph = useSceneGraph()
  // A ref, not state: caching a decoded bitmap must not itself trigger a render.
  // On load the place-underlay dispatch drives the redraw; on resolve-on-open the
  // decode tick below drives it instead (no dispatch happens there).
  const cacheRef = useRef<BitmapCache>(new Map())
  const cache = cacheRef.current

  const loadImage = useLoadImage(session, cache, assets)
  const arming = useCalibrationArming(activeTool)
  const decodeTick = useResolveUnderlaysOnOpen(graph, assets, cache)
  const resolveDrawables = useCallback(
    (sceneGraph: SceneGraph, floorId: string | undefined): DrawableUnderlay[] =>
      resolveDrawablesFrom(cache, sceneGraph, floorId),
    // decodeTick busts this memo when a resolve-on-open decode finishes, so a
    // fresh resolveDrawables re-reads the now-populated cache and the underlay
    // paints; cache is a stable ref, so it never changes this identity on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- decodeTick is the repaint signal
    [cache, decodeTick],
  )

  // arming is a stable memoized bundle of exactly the four arming context fields,
  // so spreading it keeps the value referentially stable across renders that do
  // not change arming, the loaded image, or the resolver.
  const value = useMemo<UnderlayContextValue>(
    () => ({ loadImage, ...arming, resolveDrawables }),
    [loadImage, arming, resolveDrawables],
  )

  return createElement(UnderlayContext.Provider, { value }, children)
}

// The base unit a bare calibration entry assumes, by unit system. A user typing
// "3" reads as 3 m (metric) or 3 ft (imperial); a unit token in the entry
// (for example "10'") always overrides this.
const ASSUMED_UNIT_BY_UNITS: Record<UnitSystem, AssumedUnit> = {
  metric: 'm',
  imperial: 'ft',
}

// The calibration distance entry is a window.prompt because slice 12's panel
// exposes no distance input; a panel field is a documented follow-up.
const CALIBRATION_PROMPT = 'Enter the known real-world distance (for example "3 m" or "10\'")'

// Convert a world point into the underlay's source-pixel space using its
// placement. Rotation is 0 this slice, so the map is a pure offset and scale.
function worldToPixel(world: Point, placement: UnderlayPlacement): Point {
  return {
    x: (world.x - placement.offset.x) / placement.millimetersPerPixel,
    y: (world.y - placement.offset.y) / placement.millimetersPerPixel,
  }
}

// Parse the typed distance to millimeters, assuming the project's base unit for a
// bare number. An empty or unparseable entry yields undefined so the caller drops
// the calibration; this try/catch is the only place that tolerance lives.
function parseKnownDistance(text: string, assumeUnit: AssumedUnit): number | undefined {
  const trimmed = text.trim()
  if (trimmed === '') {
    return undefined
  }
  try {
    return parseLength(trimmed, { assumeUnit })
  } catch {
    return undefined
  }
}

export interface CalibrationCommit {
  session: EditorSession
  graph: SceneGraph
  armedUnderlayId: string
  units: UnitSystem
}

// The armed underlay's scene node, matched by its raw underlay id against the
// namespaced node id; null when the armed underlay is no longer present.
function armedUnderlayNode(graph: SceneGraph, armedUnderlayId: string): UnderlaySceneNode | null {
  const nodeId = `${UNDERLAY_NODE_PREFIX}${armedUnderlayId}`
  return graph.underlays.find((node) => node.id === nodeId) ?? null
}

/**
 * Complete a calibration: prompt for the known distance, convert the measured
 * world segment to pixels, derive the new scale, and dispatch the calibrated
 * placement. Any cancel (no armed node, blank or unparseable entry) dispatches
 * nothing. Lives here so the plan-view canvas glue stays composition-only.
 */
export function commitCalibration(segment: PreviewSegment, commit: CalibrationCommit): void {
  const node = armedUnderlayNode(commit.graph, commit.armedUnderlayId)
  if (node === null) {
    return
  }
  const entry = window.prompt(CALIBRATION_PROMPT) ?? ''
  const knownMm = parseKnownDistance(entry, ASSUMED_UNIT_BY_UNITS[commit.units])
  if (knownMm === undefined) {
    return
  }
  const pixelStart = worldToPixel(segment.start, node.placement)
  const pixelEnd = worldToPixel(segment.end, node.placement)
  const scale = calibrationScale({ start: pixelStart, end: pixelEnd }, knownMm)
  const next = applyCalibration(node.placement, scale)
  commit.session.dispatch(calibrateUnderlay(node.floorId, commit.armedUnderlayId, next))
}

function eventToWorld(event: PointerEvent<HTMLCanvasElement>, viewport: Viewport): Point {
  return screenToWorld(eventToCanvas(event, event.currentTarget), viewport)
}

export interface CalibrationInteractionDeps {
  session: EditorSession
  graph: SceneGraph
  tool: ToolId
  viewport: Viewport
  units: UnitSystem
  underlay: UnderlayContextValue
}

export interface CalibrationInteraction {
  calibration: PreviewSegment | undefined
  onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void
  onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void
  onPointerLeave: () => void
}

// Advance the two-click tool on each calibrate-tool click and commit on the
// completing second click; other tools are inert here.
function applyCalibrationClick(world: Point, deps: CalibrationInteractionDeps): void {
  const { session, graph, units, underlay } = deps
  const { armedUnderlayId } = underlay
  const result = advanceCalibrationTool(underlay.calibrationToolState, world)
  underlay.setCalibrationToolState(result.state)
  if (result.segment && armedUnderlayId !== null) {
    commitCalibration(result.segment, { session, graph, armedUnderlayId, units })
  }
}

/** Drives the two-click calibration measurement; inert unless the calibrate tool is active. */
function useCalibrationInteraction(deps: CalibrationInteractionDeps): CalibrationInteraction {
  const { tool, viewport, underlay } = deps
  const [pointer, setPointer] = useState<Point | null>(null)

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      if (tool === 'calibrate') {
        applyCalibrationClick(eventToWorld(event, viewport), deps)
      }
    },
    [tool, viewport, deps],
  )

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      if (tool === 'calibrate') {
        setPointer(eventToWorld(event, viewport))
      }
    },
    [tool, viewport],
  )

  const onPointerLeave = useCallback(() => setPointer(null), [])

  const calibration =
    tool === 'calibrate' && pointer
      ? calibrationPreviewSegment(underlay.calibrationToolState, pointer)
      : undefined

  return { calibration, onPointerDown, onPointerMove, onPointerLeave }
}

export interface PlanUnderlayLayerDeps {
  session: EditorSession
  graph: SceneGraph
  tool: ToolId
  viewport: Viewport
  // The floor whose underlays are shown (the active floor); null before any floor
  // is selected.
  activeFloorId: string | null
}

export interface PlanUnderlayLayer {
  underlays: readonly DrawableUnderlay[]
  calibration: CalibrationInteraction
}

/**
 * The plan-view facing facade: resolves the active floor's drawable underlays
 * from the in-memory bitmap cache and wires the calibration pointer interaction.
 * Keeps the underlay layer's session/graph plumbing out of the canvas glue.
 */
export function usePlanUnderlayLayer(deps: PlanUnderlayLayerDeps): PlanUnderlayLayer {
  const { session, graph, tool, viewport, activeFloorId } = deps
  const underlay = useUnderlay()
  const project = session.getProject()
  const floorId = activeFloorId ?? project.floors[0]?.id
  // resolveDrawablesFrom returns the shared empty array when the floor has no
  // drawable underlays, so this stays referentially stable across renders in the
  // common no-underlay case and the plan redraw skips them.
  const underlays = underlay.resolveDrawables(graph, floorId)
  const calibration = useCalibrationInteraction({
    session,
    graph,
    tool,
    viewport,
    units: project.meta.units,
    underlay,
  })
  return { underlays, calibration }
}
