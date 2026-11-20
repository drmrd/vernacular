---
slug: decisions/ADR-0212-one-owner-holds-the-open-project
title: 'ADR-0212: One owner holds the open project, and the application reaches stores only through its ports builder'
type: decision
tags: [app-shell, session, document-handle, projects, storage, react]
related:
  [
    decisions/ADR-0175-session-layer-for-application-state,
    decisions/ADR-0183-own-id-for-a-project-started-after-a-failed-load,
    decisions/ADR-0187-projects-page-with-document-identity,
    decisions/ADR-0189-one-writer-and-second-tab-sees-projects-page,
  ]
sourceFiles:
  [
    app/use-open-project.ts,
    app/owner-memory.ts,
    app/pending-closes.ts,
    app/use-project-boot.ts,
    app/create-session-ports.ts,
    app/project-action-helpers.ts,
    app/use-workspace-state.ts,
    session/index.ts,
    session/testing/index.ts,
    tests/architecture/app-reaches-stores-through-flows.test.ts,
    tests/architecture/session-testing-entry.test.ts,
    docs/specs/2026-11-15-session-layer-and-document-identity.md,
  ]
status: current
updated: 2026-11-19
---

# ADR-0212: One owner holds the open project, and the application reaches stores only through its ports builder

## Status

Current, 2026-11-18. Sections 5.1 and 5.4 of
`docs/specs/2026-11-15-session-layer-and-document-identity.md` move the flows into `session/` and
give each open project a document handle. They leave to the builder how the application holds that
handle. This record holds that choice, and the rule that keeps stores out of the rest of `app/`.
The code is the part of `docs/plans/2026-11-15-session-layer-and-document-identity.md` on the
document handle and the flows (#685, #588).

## Context

Before this change the open project lived in React state. `app/use-project-boot.ts` kept the editor
session in a `useState`, and the project id, the store, and the snapshot store were properties of
components (section 5.4 of the specification, "Today"). Several hooks could replace the project
through `setSession`, which the workspace passed down as `onSession`: the load at start, the fresh
project after a failed load (`app/use-fresh-project.ts`), the menu actions, and the restore of a
recovered copy. The store that
Open folder created was dropped once its project had loaded, and autosave kept writing to the
workspace store under the id of the start, `'current'`. Every open overwrote that one slot, and a
folder project never saved back to its folder (section 5.3, "Today", and #588).

The handle of section 5.4 holds its own store, lock, autosave, and snapshots, so a project now
saves where it came from. The specification does not say who holds the handle. A development build
runs each effect twice. React can clean up the effects of a component and set them up again later.
A click can start a second flow while the first one waits on storage. Each of these could open a
second handle beside the first, take a lock twice, or leave a handle open that nothing closes.

## Decision

- One owner hook, `useOpenProject` in `app/use-open-project.ts`, holds the one open document handle
  of the application. `app/use-project-boot.ts` gives it the ports and the start request. The
  start, Retry, "Start a new project", and every flow (New project, an imported file, Open folder,
  a recent project, and the restore of a recovered copy) run one at a time through it. A flow is a
  function of the ports and the open handle. `runFlow` calls it and installs the handle it returns.
  While the start or another flow runs, `runFlow` calls nothing and resolves `undefined`, and Retry
  does nothing. A start request that changes during a flow waits for the flow to end. An adapter
  never installs a handle itself.
- When its effects are cleaned up, the owner waits one microtask and then closes the handle, unless
  the effects were set up again by then. It records that close for its ports object
  (`app/pending-closes.ts`), and a later start on the same ports waits until every recorded close
  has settled, so the new open finds the lock free. Effects that run again in one commit, as in the
  double run of a development build, keep the same handle, and no lock is taken or freed. When the
  effects are set up again later, the owner opens the last project it held, not the start request,
  and takes the document from its session when the store does not hold that project yet. A handle
  whose close failed is still open, and the owner installs it again.
- The session ports are built in one module, `app/create-session-ports.ts`: the workspace store,
  the lock port, the folder access, the clock, the project index, and the build version. The index
  of the browser ports is the IndexedDB form behind the memory fall-back. The same module builds
  ports in memory, with an in-memory index, which
  "Start a new project" uses when the storage did not resolve. No other production file of `app/`
  names a store.
  `tests/architecture/app-reaches-stores-through-flows.test.ts` reads every source file and
  reports each production file of `app/` that imports a store name (a type-only, renamed, or
  re-exported name counts), imports `storage/` as a namespace or re-exports all of it, or reaches
  the `workspace` member of the ports by a property, a destructuring, or an element access. Each
  finding names the file and what it reached, such as `app/sample.ts: DocumentStore`,
  `app/sample.ts: *`, or `app/sample.ts: .workspace`. Tests, stories, test support modules, and the
  ports builder are left out.
- Code outside `session/` gets an editor session only from a handle. `session/index.ts` does not
  export `createEditorSession`. The constructor is in `session/testing`, beside the in-memory
  stores and the helpers of the handle test kit, and lint lets only tests, stories, and test
  support modules import that entry. `tests/architecture/session-testing-entry.test.ts` holds both.

## Consequences

- A step that may replace the open project is a flow, and it runs through `runFlow`. It takes the
  open project from the owner's `current` argument, and its caller treats `undefined` as a flow
  that did not run. A handler that reads the handle outside a flow reads the latest committed one
  through `useLatest`, as `useSwitchFlow` in `app/project-action-helpers.ts` and the recovery
  prompt in `app/use-workspace-state.ts` do. A handler that runs between a commit and the passive
  effects, such as a Retry from a toast, then reads the handle of that commit.
- A test that needs an open project opens it through `session/testing` (`createTestPorts` and
  `openOrThrow`), or builds a bare session with `createEditorSession` from that entry. A new store
  in `app/` goes into the ports builder, or the architecture test fails.
- The rules of the owner are intricate. Its state lives in a ref (`app/owner-memory.ts`), so a
  callback sees a change before the next render, and the order of a close, a reopen, and a start
  matters. The tests in `app/use-open-project.test.tsx`, `app/use-open-project-lifetime.test.tsx`,
  `app/use-open-project-overlap.test.tsx`, and `app/use-open-project-hidden.test.tsx` hold these
  rules: the double run, a remount, a Retry that meets a flow, a start request that changes during
  a flow, a flow that rejects, and a hide while a flow runs. A change to the owner starts there.
- A close that never settles blocks every later start on the same ports, because a start waits for
  every recorded close. An owner on other ports does not wait, and while the old close still holds
  the lock its start gets `open-elsewhere`.
- The application never hides the owner today: nothing in it renders a React `Activity`. The cases
  of a hide and a later show, where the owner closes the project and opens it again, are covered by
  tests only. Those tests render the owner inside an `Activity`.

## Alternatives considered

- Several hooks that each own a part of the open project, as before. Each had to agree with the
  others on which session was current, and two of them could replace the project at the same time.
  Once a handle takes a lock and must be closed, each of those hooks would also have to close what
  it replaced.
- An option on the open request for the restore, so that the start path could open the recovered
  copy. It would change `OpenRequest`, an approved interface of the plan. A restore made of a close
  and then an open could also end with no project open when the open fails. The restore stays a
  flow: it builds the new handle before the hand-over and passes the lock from the old handle to
  the new one (ADR-0189).
- A store reference in the adapters, so that an action could read or write a project itself. Under
  that arrangement Open folder dropped its store and autosave wrote to the wrong slot. With the
  stores in the ports builder only, every read and write of a document goes through a handle that
  knows its store.

## References

- `docs/specs/2026-11-15-session-layer-and-document-identity.md`, sections 5.1, 5.3, and 5.4.
- `docs/plans/2026-11-15-session-layer-and-document-identity.md`, the section on the document
  handle and the flows.
- ADR-0175 (the session layer and its testing entry), ADR-0183 ("Start a new project"), ADR-0187
  (the switch with no prompt), and ADR-0189 (the lock that the handle takes).
- Issues #685 and #588.
