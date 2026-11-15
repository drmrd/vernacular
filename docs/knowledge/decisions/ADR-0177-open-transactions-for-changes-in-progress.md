---
slug: decisions/ADR-0177-open-transactions-for-changes-in-progress
title: 'ADR-0177: A change in progress is an open transaction that every view reads'
type: decision
tags: [commands, transactions, undo, drag, preview, session]
related:
  [
    decisions/ADR-0005-command-pattern-framework-captured-inverse,
    decisions/ADR-0175-session-layer-for-application-state,
    decisions/ADR-0176-commands-as-data-and-session-undo-history,
  ]
sourceFiles:
  [
    core/commands/dispatcher.ts,
    editor/commands/editor-commands.ts,
    editor/plan/use-plan-interaction.ts,
  ]
status: proposed
updated: 2026-11-14
---

# ADR-0177: A change in progress is an open transaction that every view reads

## Status

Proposed. The owner chose this on 2026-11-14. It takes effect when the architecture refactor round
specification is approved.

## Context

A drag in the plan draws its preview in a 2D overlay and dispatches one command on release. Until
then the 3D view and the inspector show the old state. The wall tool decides whether it owns the
next undo step by comparing scene-graph identity (`editor/plan/use-plan-interaction.ts:85-107`).

There is also no way to group commands. Deleting a selection of walls and furniture dispatches one
command for the walls and one for each furniture piece (`editor/commands/editor-commands.ts:24-40`),
so undoing the delete takes several steps. Features on the public-beta list (duplicate, paste,
mirror) each need to be one undo step.

Two other models were considered for a change in progress. Sending a real command on every pointer
move and merging them in the dispatcher is simple, but autosave and the unsaved-changes state would
see every intermediate value, and cancelling would mean an undo. Keeping the 2D overlay leaves the
3D view stale and forces direct manipulation in 3D (#415 to #420) to invent a second mechanism.

## Decision

The session can open a transaction. Commands dispatched inside it apply to a working copy of the
document, and they are not in the history yet.

- Every view reads the working copy: the plan, the 3D view, the inspector, and live readouts.
- Committing the transaction adds one history entry, however many commands it held.
- Discarding it restores the committed document and adds nothing to the history.
- Autosave and the unsaved-changes state read only the committed document.
- One transaction can be open at a time.

A drag opens a transaction on pointer down, dispatches as the pointer moves, commits on release,
and discards on Escape or pointer cancel. A compound action such as paste opens one, dispatches its
commands, and commits.

## Consequences

- Every tool gets cancel and live 3D feedback without writing either.
- The identity comparison in the wall tool goes away, because the tool owns its transaction.
- The session holds two document states while a transaction is open. Handlers must stay cheap
  enough to run on every pointer move, and the performance baseline in the refactor round covers
  that.
- `coalesceWith` probably has no remaining use. The command-layer specification decides.

## References

- `docs/specs/2026-11-14-architecture-refactor-round.md`, section 5.3.
