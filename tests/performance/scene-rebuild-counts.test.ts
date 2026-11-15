import { beforeAll, describe, expect, it } from 'vitest'
import { createEditorSession, type EditorSession } from '../../bridge'
import type { FramedScene } from '../../bridge/react/framed-scene'
import { createFramedSceneReconciler } from '../../bridge/react/framed-scene-reconciler'
import { FURNITURE_NODE_PREFIX, type SceneGraph, type SurfaceTreatment } from '../../core'
import { isUpdatingBaseline, readBaseline, writeBaselineSection } from './baseline-file'
import { REFERENCE_EDITS, createReferenceProject } from './reference-project'

const BASELINE_SECTION = 'rebuiltObjects'
const RENAME_EDIT = 'rename-project'
const EMPTY_PAINT: Record<string, SurfaceTreatment> = {}

type GroupKind = 'floor' | 'wallGroup' | 'room' | 'opening' | 'furniture'
type RebuiltCount = Record<GroupKind, number>

/** An object of the framed scene, typed through the scene root so this test needs no `three`. */
type SceneObject = Parameters<Parameters<FramedScene['root']['traverse']>[0]>[0]

/** What an element id of the scene graph names: a group of one kind, or a wall mesh. */
type ElementKind = Exclude<GroupKind, 'wallGroup'> | 'wall'

interface TrackedGroup {
  kind: GroupKind
  group: SceneObject
}

/** Every 3D group of a framed scene, keyed by its kind and the element id it carries. */
type GroupIdentities = Map<string, TrackedGroup>
type GroupEntry = [key: string, tracked: TrackedGroup]

/** The kind of every element id in the scene graph, as the framed scene carries the id. */
function elementKinds(graph: SceneGraph): Map<string, ElementKind> {
  const furnitureIds = graph.furniture.map((node) => node.id.slice(FURNITURE_NODE_PREFIX.length))
  return new Map<string, ElementKind>([
    ...graph.nodes.map((node) => [node.id, 'floor'] as const),
    ...graph.walls.map((node) => [node.id, 'wall'] as const),
    ...graph.rooms.map((node) => [node.id, 'room'] as const),
    ...graph.openings.map((node) => [node.id, 'opening'] as const),
    ...furnitureIds.map((id) => [id, 'furniture'] as const),
  ])
}

function entityIdOf(object: SceneObject | null): string | undefined {
  const id: unknown = object?.userData['entityId']
  return typeof id === 'string' ? id : undefined
}

/**
 * The wall group of a floor carries no element id of its own. It is the parent of the wall
 * meshes, and the floor group above it carries the floor id, so it is tracked under that id.
 */
function wallGroupEntry(wallMesh: SceneObject): GroupEntry | undefined {
  const group = wallMesh.parent
  const floorId = entityIdOf(group?.parent ?? null)
  if (group === null || floorId === undefined) {
    return undefined
  }
  return [`wallGroup ${floorId}`, { kind: 'wallGroup', group }]
}

/** The topmost object that carries an element id is its group; meshes inside it are skipped. */
function identifyGroups(scene: FramedScene, graph: SceneGraph): GroupIdentities {
  const kinds = elementKinds(graph)
  const identities: GroupIdentities = new Map()
  scene.root.traverse((object) => {
    const id = entityIdOf(object)
    const kind = id === undefined ? undefined : kinds.get(id)
    if (kind === undefined) {
      return
    }
    const entry: GroupEntry | undefined =
      kind === 'wall' ? wallGroupEntry(object) : [`${kind} ${id}`, { kind, group: object }]
    if (entry !== undefined && !identities.has(entry[0])) {
      identities.set(...entry)
    }
  })
  return identities
}

function zeroCount(): RebuiltCount {
  return { floor: 0, wallGroup: 0, room: 0, opening: 0, furniture: 0 }
}

function countByKind(identities: GroupIdentities): RebuiltCount {
  const counts = zeroCount()
  for (const { kind } of identities.values()) {
    counts[kind] += 1
  }
  return counts
}

/** The groups that are a different object after the edit for the same element id, by kind. */
function countRebuilt(before: GroupIdentities, after: GroupIdentities): RebuiltCount {
  const counts = zeroCount()
  for (const [key, { kind, group }] of before) {
    const next = after.get(key)
    if (next !== undefined && next.group !== group) {
      counts[kind] += 1
    }
  }
  return counts
}

type Reconcile = (session: EditorSession) => GroupIdentities

/** One reconciler for the life of the measure, fed the session's graph and paint as live. */
function reconcileWithOneReconciler(): Reconcile {
  const reconciler = createFramedSceneReconciler()
  return (session) => {
    const graph = session.getSceneGraph()
    const scene = reconciler.reconcile(graph, session.getProject().paint ?? EMPTY_PAINT)
    return identifyGroups(scene, graph)
  }
}

/** Reads the identities before the edit reconciles again: a reused group moves to the new root. */
function measureEdit(edit: (typeof REFERENCE_EDITS)[number]): RebuiltCount {
  const session = createEditorSession(createReferenceProject())
  const reconcile = reconcileWithOneReconciler()
  const before = reconcile(session)
  session.dispatch(edit.command(createReferenceProject()))
  return countRebuilt(before, reconcile(session))
}

function measureEveryEdit(): Record<string, RebuiltCount> {
  return Object.fromEntries(REFERENCE_EDITS.map((edit) => [edit.name, measureEdit(edit)]))
}

function recordedCounts(): Record<string, RebuiltCount> {
  return readBaseline()[BASELINE_SECTION] as Record<string, RebuiltCount>
}

describe('the 3D groups rebuilt by each reference edit', () => {
  const measured = measureEveryEdit()

  beforeAll(() => {
    if (isUpdatingBaseline()) {
      writeBaselineSection(BASELINE_SECTION, measured)
    }
  })

  it('reads an element id for every group of every kind in the framed scene', () => {
    const session = createEditorSession(createReferenceProject())
    const graph = session.getSceneGraph()
    const tracked = countByKind(reconcileWithOneReconciler()(session))

    expect(tracked).toEqual({
      floor: graph.nodes.length,
      wallGroup: graph.nodes.length,
      room: graph.rooms.length,
      opening: graph.openings.length,
      furniture: graph.furniture.length,
    })
  })

  it('records a count for every reference edit and no other', () => {
    expect(Object.keys(recordedCounts()).sort()).toEqual(
      REFERENCE_EDITS.map((edit) => edit.name).sort(),
    )
  })

  it.each(REFERENCE_EDITS)(
    'the $name edit rebuilds the groups recorded in the baseline',
    (edit) => {
      expect(measured[edit.name]).toEqual(recordedCounts()[edit.name])
    },
  )

  it('renaming the project rebuilds no 3D group', () => {
    expect(measured[RENAME_EDIT]).toEqual(zeroCount())
  })
})
