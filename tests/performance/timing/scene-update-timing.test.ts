import { describe, expect, it } from 'vitest'
import type { FramedScene } from '../../../bridge/react/framed-scene'
import { renameProject, type Command } from '../../../core'
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
  const samples = timeSceneUpdate(
    loggingBench(log, applied),
    commands,
    scriptedClock(log, readings),
    COUNTS,
  )
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
})

/** An object of the framed scene, typed through the scene root so this test needs no `three`. */
type SceneObject = Parameters<Parameters<FramedScene['root']['traverse']>[0]>[0]

/** The first object of the scene for each element id it carries. */
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
      expect(present.has(floorId), `the scene has the floor ${floorId}`).toBe(true)
    }
  })

  it('rebuilds the walls of the ground floor when a wall endpoint moves', () => {
    const { bench } = benchOnReferenceSession()
    bench.reconcile()
    const before = objectsByElementId(bench)

    bench.apply(commandOf(MOVE_WALL_ENDPOINT))
    bench.reconcile()

    const wall = required(createReferenceProject().floors[0]?.walls[0], 'the first wall')
    expect(rebuiltElementIds(before, objectsByElementId(bench))).toContain(wall.id)
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
