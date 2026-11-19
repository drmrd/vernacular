import { describe, expect, it } from 'vitest'
import type { FramedScene } from '../../../bridge/react/framed-scene'
import { FLOOR_NODE_PREFIX, WALL_NODE_PREFIX, renameProject, type Command } from '../../../core'
import { REFERENCE_EDITS, createReferenceProject } from '../reference-project'
import { required } from '../required'
import { createReferenceSession } from './reference-session'
import {
  createSceneUpdateBench,
  timeSceneUpdate,
  type SceneUpdateBench,
} from './scene-update-timing'

const COUNTS = { warmup: 1, timed: 2 }
const MOVE_WALL_ENDPOINT = 'move-wall-endpoint'
const RENAME_PROJECT = 'rename-project'

type Call = 'now' | 'apply' | 'reconcile' | 'undo'

/** A bench that only notes which calls it got, and with which command. */
function loggingBench(log: Call[], applied: Command[]): SceneUpdateBench {
  return {
    apply: (command) => {
      log.push('apply')
      applied.push(command)
    },
    reconcile: () => {
      log.push('reconcile')
    },
    undo: () => {
      log.push('undo')
    },
    lastScene: () => undefined,
  }
}

/** A clock that logs each read among the bench calls and returns the readings in order. */
function scriptedClock(log: Call[], readings: readonly number[]): () => number {
  let next = 0
  return () => {
    log.push('now')
    const reading = required(readings[next], `clock reading ${next}`)
    next += 1
    return reading
  }
}

const commands = ['warm-up', 'first', 'second'].map((name) => renameProject(name))

function timeWithLoggingBench(readings: readonly number[]) {
  const log: Call[] = []
  const applied: Command[] = []
  const samples = timeSceneUpdate({
    bench: loggingBench(log, applied),
    commands,
    counts: COUNTS,
    now: scriptedClock(log, readings),
  })
  return { log, applied, samples }
}

describe('timing the 3D update of an edit', () => {
  const READINGS = [5, 8, 20, 27]

  it('returns one sample for each timed command and none for the warm-up', () => {
    expect(timeWithLoggingBench(READINGS).samples).toHaveLength(COUNTS.timed)
  })

  it('holds the edit and its reconcile in the interval, and the undo and its reconcile outside it', () => {
    const { log } = timeWithLoggingBench(READINGS)

    // The surface says the warm-up samples are not returned, so no clock read is expected for them.
    // That is an inference from the surface, not a stated rule.
    const warmUp: Call[] = ['apply', 'reconcile', 'undo', 'reconcile']
    const timed: Call[] = ['now', 'apply', 'reconcile', 'now', 'undo', 'reconcile']
    expect(log).toEqual([...warmUp, ...timed, ...timed])
  })

  it('reports each sample as the difference of the two clock reads around it', () => {
    expect(timeWithLoggingBench(READINGS).samples).toEqual([3, 7])
  })

  it('applies the commands it is given in order, the warm-up command first', () => {
    const { applied } = timeWithLoggingBench(READINGS)

    expect(applied).toHaveLength(commands.length)
    commands.forEach((command, index) => {
      expect(applied[index]).toBe(command)
    })
  })

  // The command list holds the warm-up commands first, then the timed ones: the first
  // `counts.warmup` commands are not timed and read no clock, the next `counts.timed` are timed.
  // A list shorter than warmup + timed is an error that names both numbers; it is not cycled.
  it('refuses a list of commands shorter than the warm-up and timed counts together', () => {
    const counts = { warmup: 2, timed: 3 }
    const tooShort = commands.concat(commands).slice(0, 4)
    const log: Call[] = []

    const timeShortList = () =>
      timeSceneUpdate({
        bench: loggingBench(log, []),
        commands: tooShort,
        counts,
        now: scriptedClock(log, READINGS),
      })

    expect(timeShortList).toThrow(/\b5\b/)
    expect(timeShortList).toThrow(/\b4\b/)
  })
})

/** An object of the framed scene, typed through the scene root so this test needs no `three`. */
type SceneObject = Parameters<Parameters<FramedScene['root']['traverse']>[0]>[0]

/**
 * The first object of the scene for each element id it carries. The scene gives its elements
 * kind-prefixed ids, as the count gate reads them: a floor is `floor:<floor id>` and a wall mesh is
 * `wall:<wall id>`. The wall group is the unnamed parent of the wall meshes.
 */
function objectsByElementId(bench: SceneUpdateBench): Map<string, SceneObject> {
  const scene = required(bench.lastScene(), 'the scene of the last reconcile')
  const objects = new Map<string, SceneObject>()
  scene.root.traverse((object) => {
    const id: unknown = object.userData['entityId']
    if (typeof id === 'string' && !objects.has(id)) {
      objects.set(id, object)
    }
  })
  return objects
}

/** The element ids that are in both scenes as different objects: the groups that were rebuilt. */
function rebuiltElementIds(before: Map<string, SceneObject>, after: Map<string, SceneObject>) {
  return [...before]
    .filter(([id, object]) => after.has(id) && after.get(id) !== object)
    .map(([id]) => id)
}

/** The wall group holding the mesh of a wall, the group the count gate counts as rebuilt. */
function wallGroupOf(objects: Map<string, SceneObject>, wallId: string): SceneObject | null {
  const mesh = required(objects.get(`${WALL_NODE_PREFIX}${wallId}`), `the mesh of wall ${wallId}`)
  return mesh.parent
}

function commandOf(editName: string): Command {
  const edit = required(
    REFERENCE_EDITS.find((candidate) => candidate.name === editName),
    editName,
  )
  return edit.command(createReferenceProject())
}

/** The bench on a session the test holds, so the test can read the session's document. */
function benchOnReferenceSession() {
  const session = createReferenceSession()
  return { session, bench: createSceneUpdateBench(session) }
}

describe('the real bench of the 3D update', () => {
  it('leaves the document as the reference project after an edit and its undo', () => {
    const { session, bench } = benchOnReferenceSession()

    bench.apply(commandOf(MOVE_WALL_ENDPOINT))
    bench.reconcile()
    expect(session.getProject()).not.toEqual(createReferenceProject())

    bench.undo()
    bench.reconcile()
    expect(session.getProject()).toEqual(createReferenceProject())
  })

  it('reconciles the whole building, all four floors of the reference project', () => {
    const { bench } = benchOnReferenceSession()

    bench.reconcile()

    const floorIds = createReferenceProject().floors.map((floor) => floor.id)
    expect(floorIds).toHaveLength(4)
    const present = objectsByElementId(bench)
    for (const floorId of floorIds) {
      const elementId = `${FLOOR_NODE_PREFIX}${floorId}`
      expect(present.has(elementId), `the scene has the element ${elementId}`).toBe(true)
    }
  })

  it('rebuilds the walls of the ground floor when a wall endpoint moves', () => {
    const { bench } = benchOnReferenceSession()
    bench.reconcile()
    const before = objectsByElementId(bench)

    bench.apply(commandOf(MOVE_WALL_ENDPOINT))
    bench.reconcile()

    const wall = required(createReferenceProject().floors[0]?.walls[0], 'the first wall')
    const groupBefore = wallGroupOf(before, wall.id)
    expect(groupBefore).not.toBeNull()
    expect(wallGroupOf(objectsByElementId(bench), wall.id)).not.toBe(groupBefore)
  })

  it('rebuilds nothing when the project is renamed, the control of the fixed cost', () => {
    const { bench } = benchOnReferenceSession()
    bench.reconcile()
    const before = objectsByElementId(bench)

    bench.apply(commandOf(RENAME_PROJECT))
    bench.reconcile()

    expect(rebuiltElementIds(before, objectsByElementId(bench))).toEqual([])
  })
})
