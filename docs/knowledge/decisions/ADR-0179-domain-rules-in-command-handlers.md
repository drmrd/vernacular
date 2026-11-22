---
slug: decisions/ADR-0179-domain-rules-in-command-handlers
title: 'ADR-0179: Domain rules live in the command handlers'
type: decision
tags: [commands, validation, openings, invariants, core, editor]
related:
  [
    decisions/ADR-0122-opening-edits-clamp-against-neighbors,
    decisions/ADR-0176-commands-as-data-and-session-undo-history,
    decisions/ADR-0177-open-transactions-for-changes-in-progress,
  ]
sourceFiles:
  [
    core/commands/handlers/opening-commands.ts,
    core/commands/handlers/wall-commands.ts,
    editor/plan/authoring-tool-handlers.ts,
    editor/plan/use-opening-placement.ts,
  ]
status: current
updated: 2026-11-21
---

# ADR-0179: Domain rules live in the command handlers

## Status

Current. The owner chose this on 2026-11-14 and approved the architecture refactor round
specification the same day. It supersedes the part of ADR-0122 that places enforcement in the
editor. The clamping behavior ADR-0122 describes stays. The command-layer stage of that round moves
the rules into the handlers.

## Context

ADR-0122 keeps openings on one wall from overlapping by clamping edits in the editor, and it named
the risk: a path that forgets the check can break the rule. That has happened. Pointer placement
checks for overlap (`editor/plan/use-opening-placement.ts:67-72`), keyboard placement does not
(`editor/plan/authoring-tool-handlers.ts:213-231`), and the handler accepts whatever it is given
(`core/commands/handlers/opening-commands.ts:48-55`). See #677.

The same pattern shows up elsewhere. The wall handlers accept a zero-length wall. A command aimed
at a floor that does not exist does nothing and reports nothing.

Every new way to change the model (paste, mirror, import, a script) is another path that would have
to remember each rule.

## Decision

A handler validates its command before it changes anything.

- A command that breaks a rule is rejected. The rejection is typed: it names the rule and carries
  the detail a caller needs to explain it.
- `dispatch` returns the outcome. A rejected command changes nothing and adds nothing to the
  history.
- Each rule is one function in `core/`. The handler calls it to decide, and the editor calls the
  same function to clamp a drag or to explain a refusal before the user commits.

## Consequences

- No caller can skip a rule, including callers that do not exist yet.
- The editor has to handle a rejection wherever it dispatches. Announcing it is part of the
  accessibility contract.
- Documents saved before a rule existed may already break it. Loading reports such a document and
  does not refuse it. The command-layer specification decides whether anything is repaired.
- ADR-0122's clamping during a drag is unchanged for the user.

## References

- `docs/specs/2026-11-14-architecture-refactor-round.md`, section 5.3.
- ADR-0122, which this partly supersedes.

## Amendment 2026-11-21: at most one main entrance

The rule that a project holds at most one marked door lives in the handlers, not in the shape of the
file ([[ADR-0204-the-main-entrance-and-the-view-from-the-front]]). The mark and clear commands of
`core/commands/handlers/entrance-commands.ts` reassign every floor so that one mark remains or
none, and the handlers that copy or add openings drop the mark through `withoutEntranceMark`. A
test runs every registered command and checks the rule after each.

Loading a file with several marks follows option (a) of open question 6 of the first-view
specification. Nothing is reported, the first marked door in document order wins, and the next
command that marks or clears the entrance removes the extra marks. `countMarkedDoors` in
`core/commands/entrance-rule.ts` counts the marks and is ready for the load checks of the command
layer, which still decide whether any rule is reported or repaired.
