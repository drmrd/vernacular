---
slug: decisions/ADR-0176-commands-as-data-and-session-undo-history
title: 'ADR-0176: Commands and inverse steps are data, and undo history lasts for the session'
type: decision
tags: [commands, undo, history, dispatcher, core]
related:
  [
    decisions/ADR-0005-command-pattern-framework-captured-inverse,
    decisions/ADR-0177-open-transactions-for-changes-in-progress,
    decisions/ADR-0179-domain-rules-in-command-handlers,
  ]
sourceFiles:
  [
    core/commands/command.ts,
    core/commands/command-registry.ts,
    core/commands/dispatcher.ts,
    core/commands/inverse-capture.ts,
  ]
status: proposed
updated: 2026-11-14
---

# ADR-0176: Commands and inverse steps are data, and undo history lasts for the session

## Status

Proposed. The owner chose this on 2026-11-14. It takes effect when the architecture refactor round
specification is approved. It amends ADR-0005 and design specification section 7.1.

## Context

Design specification section 7.1 says undo history is part of the autosave snapshot, bounded to
about 200 commands. The code does not do that. An undo entry holds its inverse as a closure
(`core/commands/dispatcher.ts:14-17`), which cannot be written to a file, and nothing outside the
dispatcher reads the undo and redo stacks.

The same closures cause other gaps. A command is a string `type` with untyped `params`
(`core/commands/command.ts:7-18`), and the registry is a map from string to handler, so the compiler
does not connect a command to its handler. A change notification carries no data, so caches work out
what changed from object identity, and one of them gets it wrong (#676).

Three options were on the table: save the history as the specification says, keep it per session
with closures as today, or keep it per session but make it data.

Saving the history has a real cost. The command vocabulary becomes part of the file format, every
migration has to convert or drop old history, and files grow. Autosave snapshots already protect
unsaved work. Keeping closures changes nothing and leaves the dispatcher unable to say what a
command did.

## Decision

1. A typed command map links each command type to its parameters and its handler at compile time.
2. An inverse step is plain data. The dispatcher records what a command replaced in a form that can
   be inspected, copied, and logged.
3. The dispatcher reports a change set with every command: the elements created, changed, and
   removed. Subscribers and caches use it.
4. Undo history is per session and bounded. It is not saved with the project, and the file format
   does not change.
5. Design specification section 7.1 is amended to say so. The diagnostic export in section 7.6,
   which lists recent commands, reads the data history.

How handlers produce the data (recorded patches, or a comparison of the slices they replaced) is
left to the command-layer specification.

## Consequences

- Saving history later stays possible, because the data form will already exist. It would need its
  own ADR and a migration policy.
- A command with the wrong parameters fails to compile. The casts at the dispatch sites go away.
- Caches can be keyed on what changed.
- Every handler is touched once to fit the typed map.

## References

- `docs/specs/2026-11-14-architecture-refactor-round.md`, section 5.3.
- `docs/specs/2026-06-01-vernacular-design.md`, sections 7.1 and 7.6.
