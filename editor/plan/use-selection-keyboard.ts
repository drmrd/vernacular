import { useEffect } from 'react'
import {
  buildClipboardSnapshot,
  deleteEntities,
  DIMENSION_NODE_PREFIX,
  instantiateClipboard,
  OPENING_NODE_PREFIX,
  pasteEntities,
  removeFurniture,
  translateEntities,
  WALL_NODE_PREFIX,
  type Floor,
  type FurnitureInstance,
  type InstantiatedEntities,
  type Point,
} from '../../core'
import {
  readSystemClipboard,
  writeSystemClipboard,
  type ClipboardStore,
  type EditorSession,
  type SelectionStore,
} from '../../bridge'
import type { ToolId } from '../tools/active-tool-context'
import { isTextEntry } from './keyboard-guard'
import { selectedEntityIds } from './selection-entities'

// A plain arrow nudge moves by a grid step; holding shift moves by a coarse step.
const NUDGE_STEP_MM = 100
const NUDGE_SHIFT_STEP_MM = 1000
// Paste lands the copy offset from the original so it is visible and distinct;
// paste-at-pointer is a documented follow-up.
const PASTE_OFFSET: Point = { x: 300, y: 300 }

interface SelectionKeyboardContext {
  session: EditorSession
  selection: SelectionStore
  clipboard: ClipboardStore
  selectedIds: ReadonlySet<string>
  activeFloorId: string | null
  // The active floor's furniture, so a Delete can remove selected pieces; furniture
  // is not in the scene graph, so the generic deleteEntities never reaches it.
  furniture: readonly FurnitureInstance[]
}

// The floor the keyboard actions target: the active floor, falling back to the
// first floor when none is active yet (a single-floor project before any switch).
function activeFloor(ctx: SelectionKeyboardContext): Floor | undefined {
  const project = ctx.session.getProject()
  return project.floors.find((floor) => floor.id === ctx.activeFloorId) ?? project.floors[0]
}

// The arrow keys nudge in world space (y increases upward), or null for any other key.
function nudgeDelta(key: string, step: number): Point | null {
  switch (key) {
    case 'ArrowUp':
      return { x: 0, y: step }
    case 'ArrowDown':
      return { x: 0, y: -step }
    case 'ArrowLeft':
      return { x: -step, y: 0 }
    case 'ArrowRight':
      return { x: step, y: 0 }
    default:
      return null
  }
}

// The namespaced scene-node ids of the pasted entities, so the paste selects its copies.
function pastedSelection(entities: InstantiatedEntities): string[] {
  return [
    ...entities.walls.map((wall) => `${WALL_NODE_PREFIX}${wall.id}`),
    ...entities.openings.map((opening) => `${OPENING_NODE_PREFIX}${opening.id}`),
    ...entities.dimensions.map((dimension) => `${DIMENSION_NODE_PREFIX}${dimension.id}`),
  ]
}

function copySelection(ctx: SelectionKeyboardContext, floor: Floor, ids: string[]): void {
  if (ids.length === 0) {
    return
  }
  const snapshot = buildClipboardSnapshot(floor, ids)
  ctx.clipboard.write(snapshot)
  void writeSystemClipboard(snapshot)
}

function deleteSelection(ctx: SelectionKeyboardContext, floorId: string, ids: string[]): void {
  ctx.session.dispatch(deleteEntities(floorId, ids))
  ctx.selection.clear()
}

// Prefers a valid operating-system payload, falling back to the in-app store, so
// paste works within a session and across tabs when clipboard access is granted.
async function pasteSelection(ctx: SelectionKeyboardContext, floorId: string): Promise<void> {
  const snapshot = (await readSystemClipboard()) ?? ctx.clipboard.read()
  if (snapshot === undefined) {
    return
  }
  const entities = instantiateClipboard(snapshot, PASTE_OFFSET)
  ctx.session.dispatch(pasteEntities(floorId, entities))
  ctx.selection.setSelection(pastedSelection(entities))
}

// One keystroke against a resolved floor and selection.
interface KeyAction {
  event: KeyboardEvent
  ctx: SelectionKeyboardContext
  floor: Floor
  ids: string[]
}

function handleClipboardKey({ event, ctx, floor, ids }: KeyAction): void {
  const key = event.key.toLowerCase()
  if (key === 'c') {
    event.preventDefault()
    copySelection(ctx, floor, ids)
  } else if (key === 'x' && ids.length > 0) {
    event.preventDefault()
    copySelection(ctx, floor, ids)
    deleteSelection(ctx, floor.id, ids)
  } else if (key === 'v') {
    event.preventDefault()
    void pasteSelection(ctx, floor.id)
  }
}

function handleEditKey({ event, ctx, floor, ids }: KeyAction): void {
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    deleteSelection(ctx, floor.id, ids)
    return
  }
  const delta = nudgeDelta(event.key, event.shiftKey ? NUDGE_SHIFT_STEP_MM : NUDGE_STEP_MM)
  if (delta !== null) {
    event.preventDefault()
    ctx.session.dispatch(translateEntities(floor.id, ids, delta))
  }
}

// The ids of the selected furniture pieces, found by intersecting the raw
// selection with the floor's furniture (furniture carries raw, unprefixed ids).
function selectedFurnitureIds(ctx: SelectionKeyboardContext): string[] {
  return ctx.furniture.filter((item) => ctx.selectedIds.has(item.id)).map((item) => item.id)
}

// Remove each selected furniture piece and drop those ids from the selection,
// leaving any selected graph entities for the generic delete to handle.
function deleteFurniture(ctx: SelectionKeyboardContext, floorId: string, ids: string[]): void {
  for (const id of ids) {
    ctx.session.dispatch(removeFurniture(floorId, id))
  }
  ctx.selection.setSelection([...ctx.selectedIds].filter((id) => !ids.includes(id)))
}

function handleKeyDown(event: KeyboardEvent, ctx: SelectionKeyboardContext): void {
  if (isTextEntry(event.target)) {
    return
  }
  const floor = activeFloor(ctx)
  if (floor === undefined) {
    return
  }
  const action: KeyAction = { event, ctx, floor, ids: selectedEntityIds(ctx.selectedIds) }
  if (event.metaKey || event.ctrlKey) {
    handleClipboardKey(action)
    return
  }
  const furnitureIds = selectedFurnitureIds(ctx)
  if ((event.key === 'Delete' || event.key === 'Backspace') && furnitureIds.length > 0) {
    event.preventDefault()
    deleteFurniture(ctx, floor.id, furnitureIds)
  }
  if (action.ids.length > 0) {
    handleEditKey(action)
  }
}

interface SelectionKeyboardDeps {
  session: EditorSession
  selection: SelectionStore
  clipboard: ClipboardStore
  selectedIds: ReadonlySet<string>
  tool: ToolId
  // The floor the keyboard actions target (the active floor); null before any
  // floor is selected.
  activeFloorId: string | null
  // The active floor's furniture, so a Delete can remove selected pieces.
  furniture: readonly FurnitureInstance[]
}

/**
 * Binds the select-tool editing keystrokes to the window: Delete and Backspace
 * delete the selected graph entities and furniture, the arrow keys nudge the graph
 * entities, and the platform copy, cut, and paste shortcuts drive the clipboard.
 * Inert under any tool but `select`, and ignored while a form control is focused so
 * inspector typing is untouched.
 */
export function useSelectionKeyboard(deps: SelectionKeyboardDeps): void {
  const { session, selection, clipboard, selectedIds, tool, activeFloorId, furniture } = deps
  useEffect(() => {
    if (tool !== 'select') {
      return undefined
    }
    const ctx: SelectionKeyboardContext = {
      session,
      selection,
      clipboard,
      selectedIds,
      activeFloorId,
      furniture,
    }
    const listener = (event: KeyboardEvent): void => {
      handleKeyDown(event, ctx)
    }
    window.addEventListener('keydown', listener)
    return () => {
      window.removeEventListener('keydown', listener)
    }
  }, [session, selection, clipboard, selectedIds, tool, activeFloorId, furniture])
}
