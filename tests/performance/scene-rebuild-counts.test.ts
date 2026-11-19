import { beforeAll, describe, expect, it } from 'vitest'
import { type EditorSession } from '../../bridge'
import { createEditorSession } from '../../session/testing'
import type { FramedScene } from '../../bridge/react/framed-scene'
import { createFramedSceneReconciler } from '../../bridge/react/framed-scene-reconciler'
import { FURNITURE_NODE_PREFIX, type SceneGraph, type SurfaceTreatment } from '../../core'
import {
  countChangedMessage,
  isUpdatingBaseline,
  readBaseline,
  writeBaseline,
} from './baseline-file'
import { REFERENCE_EDITS, createReferenceProject, type ReferenceEdit } from './reference-project'

const BASELINE_FILE = 'baseline-scene-rebuild.json'
const GATE_MESSAGE = countChangedMessage('count of 3D groups rebuilt, removed, or added')
const RENAME_EDIT = 'rename-project'
const EMPTY_PAINT: Record<string, SurfaceTreatment> = {}

const GROUP_KINDS = ['floor', 'wallGroup', 'room', 'opening', 'furniture'] as const
type GroupKind = (typeof GROUP_KINDS)[number]
type KindCount = Record<GroupKind, number>

/**
 * What one edit did to the groups of one kind. A rebuilt group has the same element id and is a
 * different object; a removed one has an id that is gone; an added one has a new id.
 */
interface GroupChanges {
  rebuilt: number
  removed: number
  added: number
}
type EditChanges = Record<GroupKind, GroupChanges>

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
 * The lookup holds while the floor group is the direct parent of the wall group; the test that
 * reads an element id for every group of every kind fails if that stops being so.
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

function countByKind(identities: GroupIdentities): KindCount {
  const counts: KindCount = { floor: 0, wallGroup: 0, room: 0, opening: 0, furniture: 0 }
  for (const { kind } of identities.values()) {
    counts[kind] += 1
  }
  return counts
}

function noChanges(): EditChanges {
  const none = (): GroupChanges => ({ rebuilt: 0, removed: 0, added: 0 })
  return Object.fromEntries(GROUP_KINDS.map((kind) => [kind, none()])) as EditChanges
}

/** The groups rebuilt, removed, and added by the edit, by kind. */
function countChanges(before: GroupIdentities, after: GroupIdentities): EditChanges {
  const changes = noChanges()
  for (const [key, { kind, group }] of before) {
    const next = after.get(key)
    if (next === undefined) {
      changes[kind].removed += 1
    } else if (next.group !== group) {
      changes[kind].rebuilt += 1
    }
  }
  for (const [key, { kind }] of after) {
    if (!before.has(key)) {
      changes[kind].added += 1
    }
  }
  return changes
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

/**
 * Reads the identities before the edit reconciles again: a reused group moves to the new root.
 * The session edits its document in place, so the command is built from a second, identical
 * reference project. The command then reads the document as it was before the edit and shares
 * no object with the document the session changes.
 */
function measureEdit(edit: ReferenceEdit): EditChanges {
  const session = createEditorSession(createReferenceProject())
  const reconcile = reconcileWithOneReconciler()
  const before = reconcile(session)
  session.dispatch(edit.command(createReferenceProject()))
  return countChanges(before, reconcile(session))
}

function measureEveryEdit(): Record<string, EditChanges> {
  return Object.fromEntries(REFERENCE_EDITS.map((edit) => [edit.name, measureEdit(edit)]))
}

function recordedCounts(): Record<string, EditChanges> {
  return readBaseline(BASELINE_FILE) as Record<string, EditChanges>
}

describe('the 3D groups rebuilt by each reference edit', () => {
  const measured = measureEveryEdit()

  beforeAll(() => {
    if (isUpdatingBaseline()) {
      writeBaseline(BASELINE_FILE, measured)
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
    'the $name edit rebuilds, removes, and adds the groups recorded in the baseline',
    (edit) => {
      expect(measured[edit.name], GATE_MESSAGE).toEqual(recordedCounts()[edit.name])
    },
  )

  it('renaming the project rebuilds, removes, and adds no 3D group', () => {
    expect(measured[RENAME_EDIT]).toEqual(noChanges())
  })
})
