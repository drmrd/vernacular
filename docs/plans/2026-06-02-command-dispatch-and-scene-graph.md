# Command Dispatch and Scene Graph: The Behavioral Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This repository overrides the generic single-implementer flow with its own role-separated red-green-blue cycle (see `.claude/rules.md` rules 14 and 15 and `CLAUDE.md`): each behavior runs RED (the `test-author` subagent writes the failing test), GREEN (the `implementer` subagent writes the minimal implementation; it never reads the test), then BLUE (the `clean-code-reviewer` audits the diff and the `refactorer` applies findings; the phase closes with a `refactor:` marker commit, empty if there are no implementation findings).

**Goal:** Stand up the behavioral core of the domain in pure `core/`: a single command-dispatch pipeline with framework-captured inverses, linear undo/redo with coalescing and bounded history, atomic rollback on error, and a memoized scene-graph projection over the project model.

**Architecture:** Every state change flows through one dispatcher (design spec 7.1). A handler mutates the working state through an `InverseCapture` proxy that records the previous value of each top-level slice it reassigns, so the dispatcher can revert a command without a hand-written inverse. Handlers update state immutably (they reassign whole top-level slices: `state.floors = next`, `state.meta = { ...state.meta, name }`), which keeps inverse capture simple and, as a direct consequence, preserves referential identity for unchanged entities. The scene graph (design spec 6.1) is a pure, memoized projection of the project model into normalized nodes with stable IDs; the memoized deriver reuses a node whenever its source entity reference is unchanged, which is the entity-keyed dirty tracking the spec calls for. Everything is pure TypeScript, fully testable in Node, and imports only from `core/model`; no React, Three.js, or DOM.

**Tech Stack:** TypeScript (strict, `verbatimModuleSyntax`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), ES2022 `Proxy`/`Reflect`/`WeakMap`/error `cause`, Vitest for unit tests. No new dependencies.

**Scope boundary:** This plan is the second of three that together deliver the full six-layer source skeleton. It builds on the first (core domain and registries, merged in PR #15). It does NOT create the `engine/`, `bridge/`, `editor/`, or `app/` layers, the Three.js + React-Three-Fiber + WebGPU renderer, the dispatch boundary in `bridge/`, or the React app shell; those belong to the third plan (`render-and-app-skeleton`). It does NOT add a `Wall` entity, a wall-drawing tool, or IndexedDB autosave (the proof-of-life work). It does NOT add units or color science (`core/units/`, `core/color/`). It does NOT persist command history to storage (that wiring lands with autosave). It does NOT modify `docs/specs/`.

---

## Design notes

### Why a root-level inverse-capture proxy

Design spec 7.1 specifies that "the framework captures the inverse automatically via an `InverseCapture` proxy that records mutations," so handlers never hand-write reverts. A deep proxy that wraps every nested read is tempting but leaks: reading a nested object returns a proxy, and spreading that read into a new container (the idiomatic immutable update) stores proxy objects back into the state. The clean, foolproof pairing for a pure-data model is a shallow proxy over the root combined with an immutable-update handler convention:

- Handlers reassign whole top-level slices of the root state (`state.floors = next`, `state.meta = { ...state.meta, name }`). They never mutate a nested object in place.
- The proxy records, per top-level key, whether the key existed and its previous value, captured on first touch. Reverting restores those slice references exactly.
- Because a changed entity becomes a new object reference while untouched entities keep their references, the same mechanism that powers undo also powers memoized scene-graph derivation.

This interpretation is recorded in ADR-0005 during knowledge curation (Task 10). The `customRevert` escape hatch named in the spec is deferred: nothing in this skeleton needs it (YAGNI), and adding an untested optional method would draw a clean-code finding.

### Files

| File                                              | Purpose                                                                                         |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `core/commands/inverse-capture.ts`                | `CapturedInverse`, `captureInverse(root)`: the root-level recording proxy and its revert        |
| `core/commands/inverse-capture.test.ts`           | Unit tests for record-and-revert behavior                                                       |
| `core/commands/command.ts`                        | `Command<P>` and `CommandHandler<S, P>` interfaces                                              |
| `core/commands/command-registry.ts`               | `CommandRegistry<S>`: maps command `type` to handler                                            |
| `core/commands/command-registry.test.ts`          | Unit tests for registration and lookup                                                          |
| `core/commands/dispatcher.ts`                     | `Dispatcher<S>`, `DispatcherOptions`, `DEFAULT_MAX_HISTORY`: apply, undo, redo, atomic rollback |
| `core/commands/dispatcher.test.ts`                | Unit tests for apply, undo/redo, linear history, atomic rollback, unknown type                  |
| `core/commands/dispatcher-history.test.ts`        | Unit tests for coalescing and bounded history                                                   |
| `core/commands/handlers/project-commands.ts`      | Concrete commands over `Project`: rename, add/remove floor, set ceiling height (coalescing)     |
| `core/commands/handlers/project-commands.test.ts` | Integration tests exercising the whole pipeline over a real `Project`                           |
| `core/scene/scene-graph.ts`                       | `SceneNode`, `SceneGraph`, `deriveFloorNode`, `deriveSceneGraph` (pure projection)              |
| `core/scene/scene-graph.test.ts`                  | Unit tests for the pure derivation                                                              |
| `core/scene/scene-graph-deriver.ts`               | `createSceneGraphDeriver`: memoized, entity-keyed projection                                    |
| `core/scene/scene-graph-deriver.test.ts`          | Unit tests for node reuse and dirty re-derivation                                               |
| `core/index.ts`                                   | Public barrel: re-export the command and scene-graph API                                        |
| `ROADMAP.md`                                      | Note the command and scene-graph layer landed                                                   |
| `docs/knowledge/` (local, gitignored)             | Author ADR-0005 (command pattern) and ADR-0018 (scene-graph derivation)                         |
| `.superpowers/scratch/progress.md` (local)        | Capture merge SHA and prep notes for the third plan                                             |

---

## Tasks

### Task 1: Branch and commit the plan

**Files:** Create `docs/plans/2026-06-02-command-dispatch-and-scene-graph.md` (this document).

- [ ] **Step 1: Confirm the working directory, branch off an up-to-date main, and a clean tree**

```
pwd
git status --short
git checkout main && git pull
git checkout -b feat/command-dispatch-and-scene-graph
```

Expected: directory is `/Users/dan/workspace/vernacular`; `main` is at the PR #15 merge commit; the new branch is created from it. The working tree carries only this new plan file. If anything else differs, STOP and report BLOCKED with what was found.

- [ ] **Step 2: Commit the plan**

```
git add docs/plans/2026-06-02-command-dispatch-and-scene-graph.md
git commit -m "docs: plan the command dispatch and scene graph layer"
```

---

### Task 2: The inverse-capture proxy

Red-green-blue. The recording proxy is the foundation the dispatcher builds on. It records the previous value of each top-level property a handler reassigns, and reverts them on demand.

**Files:**

- Create: `core/commands/inverse-capture.ts`, `core/commands/inverse-capture.test.ts`
- Modify: `core/index.ts`

- [ ] **Step 1: Write the failing test**

`core/commands/inverse-capture.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { captureInverse } from './inverse-capture'

describe('captureInverse', () => {
  it('reverts a reassigned top-level property', () => {
    const root = { name: 'before', count: 1 }
    const { state, inverse } = captureInverse(root)

    state.name = 'after'
    expect(root.name).toBe('after')

    inverse.revert()
    expect(root.name).toBe('before')
    expect(root.count).toBe(1)
  })

  it('reverts an immutable slice replacement to the prior reference', () => {
    const root: { items: number[] } = { items: [1, 2] }
    const original = root.items
    const { state, inverse } = captureInverse(root)

    state.items = [...state.items, 3]
    expect(root.items).toEqual([1, 2, 3])

    inverse.revert()
    expect(root.items).toBe(original)
  })

  it('records only the first value when a property changes more than once', () => {
    const root = { value: 'a' }
    const { state, inverse } = captureInverse(root)

    state.value = 'b'
    state.value = 'c'

    inverse.revert()
    expect(root.value).toBe('a')
  })

  it('deletes a property that did not exist before the command', () => {
    const root: { a: number; b?: number } = { a: 1 }
    const { state, inverse } = captureInverse(root)

    state.b = 2
    expect(root.b).toBe(2)

    inverse.revert()
    expect('b' in root).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test -- inverse-capture`
Expected: FAIL, cannot resolve `./inverse-capture`.

- [ ] **Step 3: Write the implementation**

`core/commands/inverse-capture.ts`:

```typescript
/**
 * Records the previous value of every top-level property a command handler
 * reassigns on the working state, so the dispatcher can revert a command
 * without a hand-written inverse. See ADR-0005 and design spec 7.1.
 *
 * Handlers update state immutably: they reassign whole top-level slices of the
 * root (`state.floors = next`, `state.meta = { ...state.meta, name }`) rather
 * than mutating nested objects in place. The proxy therefore only needs to
 * record the root's own properties; restoring them restores the prior slice
 * references, which also preserves referential identity for unchanged entities
 * (the basis for memoized scene-graph derivation).
 */
export interface CapturedInverse {
  revert(): void
}

interface PreviousValue {
  existed: boolean
  value: unknown
}

export function captureInverse<S extends object>(root: S): { state: S; inverse: CapturedInverse } {
  const previous = new Map<PropertyKey, PreviousValue>()

  const remember = (target: S, key: PropertyKey): void => {
    if (previous.has(key)) {
      return
    }
    previous.set(key, { existed: key in target, value: Reflect.get(target, key) })
  }

  const state = new Proxy(root, {
    set(target, key, value) {
      remember(target, key)
      return Reflect.set(target, key, value)
    },
    deleteProperty(target, key) {
      remember(target, key)
      return Reflect.deleteProperty(target, key)
    },
  })

  const inverse: CapturedInverse = {
    revert() {
      for (const [key, { existed, value }] of previous) {
        if (existed) {
          Reflect.set(root, key, value)
        } else {
          Reflect.deleteProperty(root, key)
        }
      }
    },
  }

  return { state, inverse }
}
```

- [ ] **Step 4: Export from the barrel**

Append to `core/index.ts`:

```typescript
export type { CapturedInverse } from './commands/inverse-capture'
export { captureInverse } from './commands/inverse-capture'
```

- [ ] **Step 5: Run the test and the chain**

Run: `pnpm test -- inverse-capture && pnpm typecheck && pnpm lint`
Expected: tests PASS; typecheck and lint clean.

- [ ] **Step 6: Commit (test, implementation, blue marker)**

```
git add core/commands/inverse-capture.test.ts
git commit -m "test: cover the inverse-capture proxy"
git add core/commands/inverse-capture.ts core/index.ts
git commit -m "feat: add the inverse-capture proxy for command undo"
git commit --allow-empty -m "refactor: inverse-capture clean-code pass"
```

---

### Task 3: Command interfaces and the command registry

Red-green-blue. The `Command` and `CommandHandler` interfaces are pure types verified by `typecheck`; the registry has real behavior, so the failing test targets the registry.

**Files:**

- Create: `core/commands/command.ts`, `core/commands/command-registry.ts`, `core/commands/command-registry.test.ts`
- Modify: `core/index.ts`

- [ ] **Step 1: Write the failing test**

`core/commands/command-registry.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import type { CommandHandler } from './command'
import { CommandRegistry } from './command-registry'

interface Box {
  value: number
}

describe('CommandRegistry', () => {
  it('returns the handler registered for a type', () => {
    const handler: CommandHandler<Box, number> = {
      apply(state, params) {
        state.value = params
      },
    }
    const registry = new CommandRegistry<Box>().register('set', handler)

    expect(registry.handlerFor('set')).toBe(handler)
  })

  it('returns undefined for an unregistered type', () => {
    expect(new CommandRegistry<Box>().handlerFor('missing')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test -- command-registry`
Expected: FAIL, cannot resolve `./command-registry`.

- [ ] **Step 3: Write the interfaces**

`core/commands/command.ts`:

```typescript
/**
 * A serializable description of a single state mutation. Handlers are looked up
 * by `type`; `params` carries the operation's data; `description` is the
 * user-facing undo label. See ADR-0005 and design spec 7.1.
 */
export interface Command<P = unknown> {
  type: string
  params: P
  description: string
  /**
   * Merge this command with the immediately preceding one so a continuous
   * gesture (a drag) produces one undo entry, not many. Return the merged
   * command, or null to keep them as separate history entries.
   */
  coalesceWith?(previous: Command): Command | null
}

/** Applies a command's effect to the working state. See ADR-0005. */
export interface CommandHandler<S, P> {
  apply(state: S, params: P): void
}
```

- [ ] **Step 4: Write the registry**

`core/commands/command-registry.ts`:

```typescript
import type { CommandHandler } from './command'

/** Maps command `type` strings to the handler that applies them. */
export class CommandRegistry<S> {
  private readonly handlers = new Map<string, CommandHandler<S, unknown>>()

  register<P>(type: string, handler: CommandHandler<S, P>): this {
    this.handlers.set(type, handler)
    return this
  }

  handlerFor(type: string): CommandHandler<S, unknown> | undefined {
    return this.handlers.get(type)
  }
}
```

`CommandHandler<S, P>` is assignable to `CommandHandler<S, unknown>` because `apply` is a method (its parameters are checked bivariantly), so no cast is needed when storing or reading handlers.

- [ ] **Step 5: Export from the barrel**

Append to `core/index.ts`:

```typescript
export type { Command, CommandHandler } from './commands/command'
export { CommandRegistry } from './commands/command-registry'
```

- [ ] **Step 6: Run the test and the chain**

Run: `pnpm test -- command-registry && pnpm typecheck && pnpm lint`
Expected: PASS and clean.

- [ ] **Step 7: Commit (test, implementation, blue marker)**

```
git add core/commands/command-registry.test.ts
git commit -m "test: cover the command registry"
git add core/commands/command.ts core/commands/command-registry.ts core/index.ts
git commit -m "feat: add command interfaces and the command registry"
git commit --allow-empty -m "refactor: command registry clean-code pass"
```

---

### Task 4: The dispatcher core

Red-green-blue. One dispatcher applies commands, maintains linear undo/redo history, and rolls back atomically when a handler throws. Coalescing and the history bound land in Task 5.

**Files:**

- Create: `core/commands/dispatcher.ts`, `core/commands/dispatcher.test.ts`
- Modify: `core/index.ts`

- [ ] **Step 1: Write the failing test**

`core/commands/dispatcher.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import type { Command, CommandHandler } from './command'
import { CommandRegistry } from './command-registry'
import { Dispatcher } from './dispatcher'

interface Counter {
  value: number
}

function setValue(value: number): Command<{ value: number }> {
  return { type: 'set', params: { value }, description: `set ${value}` }
}

function counterRegistry(): CommandRegistry<Counter> {
  const handler: CommandHandler<Counter, { value: number }> = {
    apply(state, params) {
      state.value = params.value
    },
  }
  return new CommandRegistry<Counter>().register('set', handler)
}

describe('Dispatcher', () => {
  it('applies a command to the state', () => {
    const state: Counter = { value: 0 }
    const dispatcher = new Dispatcher(state, counterRegistry())

    dispatcher.dispatch(setValue(5))

    expect(state.value).toBe(5)
  })

  it('undoes and redoes the last command', () => {
    const state: Counter = { value: 0 }
    const dispatcher = new Dispatcher(state, counterRegistry())

    dispatcher.dispatch(setValue(5))
    expect(dispatcher.undo()).toBe(true)
    expect(state.value).toBe(0)
    expect(dispatcher.redo()).toBe(true)
    expect(state.value).toBe(5)
  })

  it('reports false when there is nothing to undo or redo', () => {
    const dispatcher = new Dispatcher<Counter>({ value: 0 }, counterRegistry())

    expect(dispatcher.undo()).toBe(false)
    expect(dispatcher.redo()).toBe(false)
  })

  it('discards the redo branch after a new command', () => {
    const state: Counter = { value: 0 }
    const dispatcher = new Dispatcher(state, counterRegistry())

    dispatcher.dispatch(setValue(1))
    dispatcher.dispatch(setValue(2))
    dispatcher.undo()
    dispatcher.dispatch(setValue(9))

    expect(dispatcher.redo()).toBe(false)
    expect(state.value).toBe(9)
  })

  it('rolls back and leaves history untouched when a handler throws', () => {
    const state: Counter = { value: 7 }
    const registry = new CommandRegistry<Counter>().register('boom', {
      apply(current) {
        current.value = -1
        throw new Error('handler exploded')
      },
    })
    const dispatcher = new Dispatcher(state, registry)

    expect(() =>
      dispatcher.dispatch({ type: 'boom', params: undefined, description: 'boom' }),
    ).toThrow('rolled back')
    expect(state.value).toBe(7)
    expect(dispatcher.canUndo()).toBe(false)
  })

  it('throws when dispatching an unregistered command type', () => {
    const dispatcher = new Dispatcher<Counter>({ value: 0 }, new CommandRegistry<Counter>())

    expect(() => dispatcher.dispatch(setValue(1))).toThrow('No handler')
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test -- commands/dispatcher`
Expected: FAIL, cannot resolve `./dispatcher`.

- [ ] **Step 3: Write the implementation**

`core/commands/dispatcher.ts`:

```typescript
import type { Command } from './command'
import type { CommandRegistry } from './command-registry'
import { captureInverse, type CapturedInverse } from './inverse-capture'

export interface DispatcherOptions {
  maxHistory?: number
}

/** Most-recent commands retained for undo, per design spec 7.1. */
export const DEFAULT_MAX_HISTORY = 200

interface HistoryEntry {
  command: Command
  inverse: CapturedInverse
}

/** The single mutation boundary for a working state. See design spec 7.1. */
export class Dispatcher<S extends object> {
  private readonly undoStack: HistoryEntry[] = []
  private readonly redoStack: Command[] = []
  private readonly maxHistory: number

  constructor(
    private readonly state: S,
    private readonly registry: CommandRegistry<S>,
    options: DispatcherOptions = {},
  ) {
    this.maxHistory = options.maxHistory ?? DEFAULT_MAX_HISTORY
  }

  dispatch(command: Command): void {
    const inverse = this.run(command)
    this.redoStack.length = 0
    this.record({ command, inverse })
  }

  undo(): boolean {
    const entry = this.undoStack.pop()
    if (entry === undefined) {
      return false
    }
    entry.inverse.revert()
    this.redoStack.push(entry.command)
    return true
  }

  redo(): boolean {
    const command = this.redoStack.pop()
    if (command === undefined) {
      return false
    }
    this.undoStack.push({ command, inverse: this.run(command) })
    return true
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  private run(command: Command): CapturedInverse {
    const handler = this.registry.handlerFor(command.type)
    if (handler === undefined) {
      throw new Error(`No handler registered for command "${command.type}"`)
    }
    const { state, inverse } = captureInverse(this.state)
    try {
      handler.apply(state, command.params)
    } catch (cause) {
      inverse.revert()
      throw new Error(`Command "${command.type}" failed and was rolled back`, { cause })
    }
    return inverse
  }

  private record(entry: HistoryEntry): void {
    this.undoStack.push(entry)
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift()
    }
  }
}
```

Coalescing is intentionally absent from `record` here; Task 5 adds it. This task's `record` only appends and enforces no bound beyond the default (the bound is tested in Task 5).

- [ ] **Step 4: Export from the barrel**

Append to `core/index.ts`:

```typescript
export type { DispatcherOptions } from './commands/dispatcher'
export { DEFAULT_MAX_HISTORY, Dispatcher } from './commands/dispatcher'
```

- [ ] **Step 5: Run the test and the chain**

Run: `pnpm test -- commands/dispatcher && pnpm typecheck && pnpm lint`
Expected: PASS and clean.

- [ ] **Step 6: Commit (test, implementation, blue marker)**

```
git add core/commands/dispatcher.test.ts
git commit -m "test: cover dispatch, undo, redo, and atomic rollback"
git add core/commands/dispatcher.ts core/index.ts
git commit -m "feat: add the command dispatcher with linear undo and redo"
git commit --allow-empty -m "refactor: dispatcher clean-code pass"
```

---

### Task 5: Coalescing and bounded history

Red-green-blue. Continuous gestures coalesce into a single undo entry, and history is bounded so it cannot grow without limit.

**Files:**

- Create: `core/commands/dispatcher-history.test.ts`
- Modify: `core/commands/dispatcher.ts`

- [ ] **Step 1: Write the failing test**

`core/commands/dispatcher-history.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import type { Command, CommandHandler } from './command'
import { CommandRegistry } from './command-registry'
import { Dispatcher } from './dispatcher'

interface Counter {
  value: number
}

const setHandler: CommandHandler<Counter, { value: number }> = {
  apply(state, params) {
    state.value = params.value
  },
}

function counterRegistry(): CommandRegistry<Counter> {
  return new CommandRegistry<Counter>().register('set', setHandler).register('bump', setHandler)
}

function setValue(value: number): Command<{ value: number }> {
  return { type: 'set', params: { value }, description: `set ${value}` }
}

function bump(value: number): Command<{ value: number }> {
  return {
    type: 'bump',
    params: { value },
    description: `bump ${value}`,
    coalesceWith(previous) {
      return previous.type === 'bump' ? bump(value) : null
    },
  }
}

describe('Dispatcher coalescing', () => {
  it('merges a continuous gesture into a single undo entry', () => {
    const state: Counter = { value: 0 }
    const dispatcher = new Dispatcher(state, counterRegistry())

    dispatcher.dispatch(bump(1))
    dispatcher.dispatch(bump(2))
    dispatcher.dispatch(bump(3))
    expect(state.value).toBe(3)

    expect(dispatcher.undo()).toBe(true)
    expect(state.value).toBe(0)
    expect(dispatcher.undo()).toBe(false)
  })

  it('redoes a coalesced gesture to its final value', () => {
    const state: Counter = { value: 0 }
    const dispatcher = new Dispatcher(state, counterRegistry())

    dispatcher.dispatch(bump(1))
    dispatcher.dispatch(bump(2))
    dispatcher.undo()

    expect(dispatcher.redo()).toBe(true)
    expect(state.value).toBe(2)
  })

  it('does not coalesce across different command types', () => {
    const state: Counter = { value: 0 }
    const dispatcher = new Dispatcher(state, counterRegistry())

    dispatcher.dispatch(setValue(1))
    dispatcher.dispatch(bump(2))

    expect(dispatcher.undo()).toBe(true)
    expect(state.value).toBe(1)
    expect(dispatcher.undo()).toBe(true)
    expect(state.value).toBe(0)
  })

  it('drops the oldest entry past the history limit', () => {
    const state: Counter = { value: 0 }
    const dispatcher = new Dispatcher(state, counterRegistry(), { maxHistory: 2 })

    dispatcher.dispatch(setValue(1))
    dispatcher.dispatch(setValue(2))
    dispatcher.dispatch(setValue(3))

    expect(dispatcher.undo()).toBe(true)
    expect(state.value).toBe(2)
    expect(dispatcher.undo()).toBe(true)
    expect(state.value).toBe(1)
    expect(dispatcher.undo()).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test -- dispatcher-history`
Expected: the coalescing cases FAIL (the current `record` always pushes a new entry, so three `bump`s produce three undo entries). The "different command types" and "history limit" cases already pass.

- [ ] **Step 3: Add the inverse combiner**

Add this module-level function at the bottom of `core/commands/dispatcher.ts`, after the class:

```typescript
function combineInverses(first: CapturedInverse, second: CapturedInverse): CapturedInverse {
  return {
    revert() {
      first.revert()
      second.revert()
    },
  }
}
```

- [ ] **Step 4: Teach `record` to coalesce**

Replace the body of the `record` method in `core/commands/dispatcher.ts`:

```typescript
  private record(entry: HistoryEntry): void {
    const previous = this.undoStack.at(-1)
    const merged = previous ? entry.command.coalesceWith?.(previous.command) : undefined
    if (previous && merged) {
      this.undoStack[this.undoStack.length - 1] = {
        command: merged,
        inverse: combineInverses(entry.inverse, previous.inverse),
      }
      return
    }
    this.undoStack.push(entry)
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift()
    }
  }
```

When the incoming command coalesces with the top of the undo stack, the top entry is replaced with the merged command and a combined inverse that reverts the newer effect first and then the older one. Reverting the merged entry therefore unwinds the whole gesture in one undo. Redo re-applies the merged command (whose params hold the gesture's final value), reproducing the net effect.

- [ ] **Step 5: Run the test and the chain**

Run: `pnpm test -- dispatcher-history && pnpm typecheck && pnpm lint`
Expected: all cases PASS; typecheck and lint clean.

- [ ] **Step 6: Confirm the Task 4 dispatcher tests still pass**

Run: `pnpm test -- commands/dispatcher`
Expected: the original dispatcher suite still PASSES (coalescing did not regress linear behavior).

- [ ] **Step 7: Commit (test, implementation, blue marker)**

```
git add core/commands/dispatcher-history.test.ts
git commit -m "test: cover command coalescing and bounded history"
git add core/commands/dispatcher.ts
git commit -m "feat: coalesce continuous gestures into one undo entry"
git commit --allow-empty -m "refactor: coalescing clean-code pass"
```

---

### Task 6: Project command handlers

Red-green-blue. Concrete commands over the real `Project` model: they double as the integration test that the whole pipeline (proxy, dispatcher, coalescing) works end to end, and they establish the immutable-update handler convention for future command authors.

**Files:**

- Create: `core/commands/handlers/project-commands.ts`, `core/commands/handlers/project-commands.test.ts`
- Modify: `core/index.ts`

- [ ] **Step 1: Write the failing test**

`core/commands/handlers/project-commands.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { CommandRegistry } from '../command-registry'
import { Dispatcher } from '../dispatcher'
import { DEFAULT_CEILING_HEIGHT_MM, createEmptyProject } from '../../model/factories'
import type { Project } from '../../model/types'
import {
  addFloor,
  registerProjectCommands,
  removeFloor,
  renameProject,
  setFloorCeilingHeight,
} from './project-commands'

function newProject(): Project {
  return createEmptyProject({
    name: 'House',
    units: 'metric',
    era: 'victorian',
    appVersion: '0.1.0',
  })
}

function projectDispatcher(state: Project): Dispatcher<Project> {
  return new Dispatcher(state, registerProjectCommands(new CommandRegistry<Project>()))
}

describe('project commands', () => {
  it('adds a floor and undoes it', () => {
    const state = newProject()
    const dispatcher = projectDispatcher(state)

    dispatcher.dispatch(addFloor('Ground'))
    expect(state.floors.map((floor) => floor.name)).toEqual(['Ground'])

    dispatcher.undo()
    expect(state.floors).toEqual([])
  })

  it('renames the project and restores the prior name on undo', () => {
    const state = newProject()
    const dispatcher = projectDispatcher(state)

    dispatcher.dispatch(renameProject('Cottage'))
    expect(state.meta.name).toBe('Cottage')

    dispatcher.undo()
    expect(state.meta.name).toBe('House')
  })

  it('removes a floor by id and restores it on undo', () => {
    const state = newProject()
    const dispatcher = projectDispatcher(state)
    dispatcher.dispatch(addFloor('Ground'))
    const floorId = state.floors[0]!.id

    dispatcher.dispatch(removeFloor(floorId))
    expect(state.floors).toEqual([])

    dispatcher.undo()
    expect(state.floors.map((floor) => floor.id)).toEqual([floorId])
  })

  it('coalesces successive ceiling-height adjustments on the same floor', () => {
    const state = newProject()
    const dispatcher = projectDispatcher(state)
    dispatcher.dispatch(addFloor('Ground'))
    const floorId = state.floors[0]!.id

    dispatcher.dispatch(setFloorCeilingHeight(floorId, 2600))
    dispatcher.dispatch(setFloorCeilingHeight(floorId, 2700))
    expect(state.floors[0]!.defaultCeilingHeight).toBe(2700)

    dispatcher.undo()
    expect(state.floors[0]!.defaultCeilingHeight).toBe(DEFAULT_CEILING_HEIGHT_MM)
  })

  it('leaves untouched floors referentially identical after an edit', () => {
    const state = newProject()
    const dispatcher = projectDispatcher(state)
    dispatcher.dispatch(addFloor('Ground'))
    dispatcher.dispatch(addFloor('Upper'))
    const untouched = state.floors[0]!
    const editedId = state.floors[1]!.id

    dispatcher.dispatch(setFloorCeilingHeight(editedId, 2600))

    expect(state.floors[0]).toBe(untouched)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test -- project-commands`
Expected: FAIL, cannot resolve `./project-commands`.

- [ ] **Step 3: Write the implementation**

`core/commands/handlers/project-commands.ts`:

```typescript
import { createFloor } from '../../model/factories'
import type { Floor, Project } from '../../model/types'
import type { Command, CommandHandler } from '../command'
import type { CommandRegistry } from '../command-registry'

export const RENAME_PROJECT = 'project/rename'
export const ADD_FLOOR = 'project/add-floor'
export const REMOVE_FLOOR = 'project/remove-floor'
export const SET_FLOOR_CEILING_HEIGHT = 'project/set-floor-ceiling-height'

export interface RenameProjectParams {
  name: string
}

export function renameProject(name: string): Command<RenameProjectParams> {
  return { type: RENAME_PROJECT, params: { name }, description: `Rename project to "${name}"` }
}

export interface AddFloorParams {
  floor: Floor
}

export function addFloor(name: string): Command<AddFloorParams> {
  // Build the floor when the command is created so redo reapplies the same id.
  return {
    type: ADD_FLOOR,
    params: { floor: createFloor(name) },
    description: `Add floor "${name}"`,
  }
}

export interface RemoveFloorParams {
  floorId: string
}

export function removeFloor(floorId: string): Command<RemoveFloorParams> {
  return { type: REMOVE_FLOOR, params: { floorId }, description: 'Remove floor' }
}

export interface SetFloorCeilingHeightParams {
  floorId: string
  height: number
}

export function setFloorCeilingHeight(
  floorId: string,
  height: number,
): Command<SetFloorCeilingHeightParams> {
  return {
    type: SET_FLOOR_CEILING_HEIGHT,
    params: { floorId, height },
    description: 'Adjust ceiling height',
    coalesceWith(previous) {
      if (previous.type !== SET_FLOOR_CEILING_HEIGHT) {
        return null
      }
      const previousParams = previous.params as SetFloorCeilingHeightParams
      return previousParams.floorId === floorId ? setFloorCeilingHeight(floorId, height) : null
    },
  }
}

const renameProjectHandler: CommandHandler<Project, RenameProjectParams> = {
  apply(state, params) {
    state.meta = { ...state.meta, name: params.name }
  },
}

const addFloorHandler: CommandHandler<Project, AddFloorParams> = {
  apply(state, params) {
    state.floors = [...state.floors, params.floor]
  },
}

const removeFloorHandler: CommandHandler<Project, RemoveFloorParams> = {
  apply(state, params) {
    state.floors = state.floors.filter((floor) => floor.id !== params.floorId)
  },
}

const setFloorCeilingHeightHandler: CommandHandler<Project, SetFloorCeilingHeightParams> = {
  apply(state, params) {
    state.floors = state.floors.map((floor) =>
      floor.id === params.floorId ? { ...floor, defaultCeilingHeight: params.height } : floor,
    )
  },
}

export function registerProjectCommands(
  registry: CommandRegistry<Project>,
): CommandRegistry<Project> {
  return registry
    .register(RENAME_PROJECT, renameProjectHandler)
    .register(ADD_FLOOR, addFloorHandler)
    .register(REMOVE_FLOOR, removeFloorHandler)
    .register(SET_FLOOR_CEILING_HEIGHT, setFloorCeilingHeightHandler)
}
```

Each handler reassigns only a top-level slice of the state (`state.meta` or `state.floors`); none mutates a nested object in place. `filter` and `map` return the same `Floor` object for every unchanged floor, so the inverse-capture proxy records the prior array reference and untouched entities keep their identity.

- [ ] **Step 4: Export from the barrel**

Append to `core/index.ts`:

```typescript
export type {
  AddFloorParams,
  RemoveFloorParams,
  RenameProjectParams,
  SetFloorCeilingHeightParams,
} from './commands/handlers/project-commands'
export {
  ADD_FLOOR,
  REMOVE_FLOOR,
  RENAME_PROJECT,
  SET_FLOOR_CEILING_HEIGHT,
  addFloor,
  registerProjectCommands,
  removeFloor,
  renameProject,
  setFloorCeilingHeight,
} from './commands/handlers/project-commands'
```

- [ ] **Step 5: Run the test and the chain**

Run: `pnpm test -- project-commands && pnpm typecheck && pnpm lint`
Expected: PASS and clean.

- [ ] **Step 6: Commit (test, implementation, blue marker)**

```
git add core/commands/handlers/project-commands.test.ts
git commit -m "test: cover the project command handlers end to end"
git add core/commands/handlers/project-commands.ts core/index.ts
git commit -m "feat: add project command handlers over the dispatcher"
git commit --allow-empty -m "refactor: project commands clean-code pass"
```

---

### Task 7: The pure scene-graph projection

Red-green-blue. A pure function projects the project model into a normalized scene graph with stable per-floor IDs (design spec 6.1). The memoized deriver lands in Task 8.

**Files:**

- Create: `core/scene/scene-graph.ts`, `core/scene/scene-graph.test.ts`
- Modify: `core/index.ts`

- [ ] **Step 1: Write the failing test**

`core/scene/scene-graph.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { createEmptyProject, createFloor } from '../model/factories'
import type { Project } from '../model/types'
import { deriveSceneGraph } from './scene-graph'

function projectWithFloors(): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    era: 'victorian',
    appVersion: '0.1.0',
  })
  project.floors = [
    createFloor('Ground', { id: 'g', elevation: 0 }),
    createFloor('Upper', { id: 'u', elevation: 2800 }),
  ]
  return project
}

describe('deriveSceneGraph', () => {
  it('derives a stable node per floor', () => {
    const graph = deriveSceneGraph(projectWithFloors())

    expect(graph.nodes.map((node) => node.id)).toEqual(['floor:g', 'floor:u'])
    expect(graph.nodes.map((node) => node.kind)).toEqual(['floor', 'floor'])
    expect(graph.nodes.map((node) => node.name)).toEqual(['Ground', 'Upper'])
  })

  it('is a pure projection: equal input yields equal output', () => {
    const project = projectWithFloors()

    expect(deriveSceneGraph(project)).toEqual(deriveSceneGraph(project))
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test -- scene/scene-graph`
Expected: FAIL, cannot resolve `./scene-graph`.

- [ ] **Step 3: Write the implementation**

`core/scene/scene-graph.ts`:

```typescript
import type { Floor, Project } from '../model/types'

export interface SceneNode {
  /** Stable, kind-namespaced identifier derived from the source entity id. */
  id: string
  kind: 'floor'
  name: string
  elevation: number
}

export interface SceneGraph {
  nodes: SceneNode[]
}

const FLOOR_NODE_PREFIX = 'floor:'

export function deriveFloorNode(floor: Floor): SceneNode {
  return {
    id: `${FLOOR_NODE_PREFIX}${floor.id}`,
    kind: 'floor',
    name: floor.name,
    elevation: floor.elevation,
  }
}

/** Pure projection of the project model into a normalized scene graph. */
export function deriveSceneGraph(project: Project): SceneGraph {
  return { nodes: project.floors.map(deriveFloorNode) }
}
```

- [ ] **Step 4: Export from the barrel**

Append to `core/index.ts`:

```typescript
export type { SceneGraph, SceneNode } from './scene/scene-graph'
export { deriveFloorNode, deriveSceneGraph } from './scene/scene-graph'
```

- [ ] **Step 5: Run the test and the chain**

Run: `pnpm test -- scene/scene-graph && pnpm typecheck && pnpm lint`
Expected: PASS and clean.

- [ ] **Step 6: Commit (test, implementation, blue marker)**

```
git add core/scene/scene-graph.test.ts
git commit -m "test: cover the pure scene-graph projection"
git add core/scene/scene-graph.ts core/index.ts
git commit -m "feat: derive a scene graph from the project model"
git commit --allow-empty -m "refactor: scene-graph clean-code pass"
```

---

### Task 8: The memoized scene-graph deriver

Red-green-blue. A stateful deriver reuses a floor's node whenever its source reference is unchanged, and rebuilds only the node for a replaced floor. This is the entity-keyed dirty tracking the spec calls for (design spec 6.1, 6.10), and it composes with the immutable-update handler convention from Task 6.

**Files:**

- Create: `core/scene/scene-graph-deriver.ts`, `core/scene/scene-graph-deriver.test.ts`
- Modify: `core/index.ts`

- [ ] **Step 1: Write the failing test**

`core/scene/scene-graph-deriver.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { createEmptyProject, createFloor } from '../model/factories'
import type { Floor, Project } from '../model/types'
import { createSceneGraphDeriver } from './scene-graph-deriver'

function projectWith(floors: Floor[]): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    era: 'victorian',
    appVersion: '0.1.0',
  })
  project.floors = floors
  return project
}

describe('createSceneGraphDeriver', () => {
  it('reuses node references for unchanged floors', () => {
    const ground = createFloor('Ground', { id: 'g' })
    const upper = createFloor('Upper', { id: 'u' })
    const derive = createSceneGraphDeriver()

    const first = derive(projectWith([ground, upper]))
    const second = derive(projectWith([ground, upper]))

    expect(second.nodes[0]).toBe(first.nodes[0])
    expect(second.nodes[1]).toBe(first.nodes[1])
  })

  it('rebuilds only the node for a replaced floor', () => {
    const ground = createFloor('Ground', { id: 'g' })
    const upper = createFloor('Upper', { id: 'u' })
    const derive = createSceneGraphDeriver()

    const first = derive(projectWith([ground, upper]))
    const editedUpper = { ...upper, name: 'Attic' }
    const second = derive(projectWith([ground, editedUpper]))

    expect(second.nodes[0]).toBe(first.nodes[0])
    expect(second.nodes[1]).not.toBe(first.nodes[1])
    expect(second.nodes[1]!.name).toBe('Attic')
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test -- scene-graph-deriver`
Expected: FAIL, cannot resolve `./scene-graph-deriver`.

- [ ] **Step 3: Write the implementation**

`core/scene/scene-graph-deriver.ts`:

```typescript
import type { Floor, Project } from '../model/types'
import { deriveFloorNode, type SceneGraph, type SceneNode } from './scene-graph'

/**
 * Returns a deriver that memoizes scene nodes by source-floor reference. A
 * command that replaces a floor (the immutable-update convention) produces a
 * new reference, so only that floor's node is rebuilt; untouched floors keep
 * their nodes. See design spec 6.1 and 6.10.
 */
export function createSceneGraphDeriver(): (project: Project) => SceneGraph {
  const cache = new WeakMap<Floor, SceneNode>()

  const nodeFor = (floor: Floor): SceneNode => {
    const cached = cache.get(floor)
    if (cached !== undefined) {
      return cached
    }
    const node = deriveFloorNode(floor)
    cache.set(floor, node)
    return node
  }

  return (project) => ({ nodes: project.floors.map(nodeFor) })
}
```

- [ ] **Step 4: Export from the barrel**

Append to `core/index.ts`:

```typescript
export { createSceneGraphDeriver } from './scene/scene-graph-deriver'
```

- [ ] **Step 5: Run the test and the chain**

Run: `pnpm test -- scene-graph-deriver && pnpm typecheck && pnpm lint`
Expected: PASS and clean.

- [ ] **Step 6: Commit (test, implementation, blue marker)**

```
git add core/scene/scene-graph-deriver.test.ts
git commit -m "test: cover the memoized scene-graph deriver"
git add core/scene/scene-graph-deriver.ts core/index.ts
git commit -m "feat: memoize scene-graph derivation by floor reference"
git commit --allow-empty -m "refactor: scene-graph deriver clean-code pass"
```

---

### Task 9: Full check chain

**Files:** none.

- [ ] **Step 1: Run the complete chain**

```
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
```

Expected: every stage passes. If `format:check` flags anything, run `pnpm format`, review the diff, and amend the relevant commit. If a real failure surfaces, STOP and report.

- [ ] **Step 2: Confirm coverage includes the new modules**

```
pnpm exec vitest run --coverage
```

Expected: `core/commands/**` and `core/scene/**` files appear in the coverage report. (Use `pnpm exec vitest run --coverage`, not `pnpm test -- --coverage`: the `--` makes `--coverage` a positional filter and coverage never enables. See the project memory `vitest-filter-and-coverage-invocation`.)

---

### Task 10: Update the roadmap and refresh the local knowledge graph

**Files:** Modify `ROADMAP.md`. Local-only writes under `docs/knowledge/` (gitignored; not committed).

- [ ] **Step 1: Note the command and scene-graph layer on the roadmap**

In the "Foundation work" table, update the `Six-layer source skeleton` row note to record that the command dispatch and scene-graph core landed (it stays `in progress`; the engine/bridge/editor/app layers remain). Keep the row status `in progress`.

- [ ] **Step 2: Verify and commit the roadmap**

```
pnpm format:check
git add ROADMAP.md
git commit -m "docs: note the command and scene-graph core on the roadmap"
```

- [ ] **Step 3: Author the architecture decision records (local cache)**

Dispatch the `knowledge-curator` (or write directly). Capture two decisions in the local ADR cache under `docs/knowledge/decisions/`:

- ADR-0005 (command pattern): the `Command`/`CommandHandler` interfaces, the single `Dispatcher`, the root-level `InverseCapture` proxy paired with the immutable-update handler convention, linear undo/redo, gesture coalescing, atomic rollback on error, and bounded history. Note the interpretation choice (root-level proxy plus immutable updates, rather than a deep proxy) and that `customRevert` is deferred (YAGNI). The design specification (section 7.1) remains authoritative; this ADR records the implementation interpretation.
- ADR-0018 (scene-graph derivation): the pure `deriveSceneGraph` projection, stable kind-namespaced node IDs, and the memoized deriver that reuses nodes by source-entity reference as the entity-keyed dirty-tracking mechanism.

- [ ] **Step 4: Regenerate the local index**

```
pnpm knowledge:index
```

Expected: regenerates the gitignored `INDEX.md` and `index.json`. Nothing to commit.

---

### Task 11: Update the working-notes scratchpad

**Files:** local-only `.superpowers/scratch/progress.md` (gitignored).

- [ ] **Step 1: Record progress (after the branch merges in Task 12)**

In the scratchpad, after the branch merges:

- Add a row to the merged-on-main table recording this work and its merge SHA.
- In the "Six-layer skeleton split" section, mark plan 2 (command dispatch and scene graph) done with its merge SHA, and mark plan 3 (render and app skeleton) next.
- Add a prep note for plan 3: the `engine/` layer is the only Three.js importer; `bridge/` owns the dispatch boundary and is the only place outside `core/commands/` that calls `dispatch`; both renderers consume the scene graph produced by `deriveSceneGraph`/`createSceneGraphDeriver` (now in place); the command pipeline and registries are ready to wire to the React shell.

---

### Task 12: Finish the development branch

- [ ] **Step 1: Use the finishing-a-development-branch skill**

Announce: "I'm using the finishing-a-development-branch skill to complete this work." Verify the full check chain is green, then follow the established repository path: push the branch and open a PR to `main` (the workflow forbids pushing directly to `main`), track CI, fix any failures, and merge with the merge-commit strategy once green and the `pr-reviewer` verdict is satisfied. Use the repository's PR template: Summary, Test plan (the check chain plus CI green), and the Knowledge graph checkbox (architectural change: ADR-0005 and ADR-0018 written locally).

---

## Self-review

**Spec coverage.** Design spec 7.1 (commands and undo/redo): `Command`/`CommandHandler` interfaces (Task 3), the single dispatcher and framework-captured inverse via the `InverseCapture` proxy (Tasks 2, 4), coalescing (Task 5), linear history (Task 4), bounded history (Task 5), atomic-on-error rollback (Task 4), and concrete handlers grouped by domain under `core/commands/handlers/` (Task 6). Design spec 6.1 (scene graph as the intermediate representation): the pure, memoized projection in `core/scene/` with stable IDs and entity-keyed reuse (Tasks 7, 8). Deferred-by-design and tracked in the scope boundary: persistence of history with autosave, selection state (lives in `bridge/`), the engine/bridge/editor/app layers and renderer (third plan), the `Wall` entity and wall-drawing tool (proof-of-life), and units and color.

**Placeholder scan.** Every code step carries complete, runnable content. No "TBD", no "add error handling", no "similar to Task N".

**Type consistency.** `CapturedInverse`/`captureInverse` are defined in Task 2 and consumed unchanged by the dispatcher (Tasks 4, 5). `Command`/`CommandHandler` are defined in Task 3 and used identically by the registry, the dispatcher, and the project handlers (Tasks 3 through 6). `CommandRegistry<S>`/`Dispatcher<S>`/`DispatcherOptions`/`DEFAULT_MAX_HISTORY` are defined in Tasks 3 and 4 and reused by the history tests and project-command tests. `SceneNode`/`SceneGraph`/`deriveFloorNode`/`deriveSceneGraph` are defined in Task 7 and consumed by the memoized deriver in Task 8. The `Project`, `Floor`, `createFloor`, `createEmptyProject`, and `DEFAULT_CEILING_HEIGHT_MM` names match their `core/model` declarations from the prior plan. Barrel export names match their source declarations across Tasks 2 through 8.

```

```
