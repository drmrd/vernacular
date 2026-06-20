---
slug: decisions/ADR-0108-validate-dimension-commands-in-core
title: 'ADR-0108: Validate dimension commands in core and surface rejections inline'
type: decision
tags:
  [
    core,
    commands,
    dispatcher,
    validation,
    units,
    length-bounds,
    inspector,
    editor,
    accessibility,
    aria-invalid,
    design-system,
    field,
  ]
related:
  [
    decisions/ADR-0005-command-pattern-framework-captured-inverse,
    decisions/ADR-0027-units-module-targets-millimeter-storage,
    decisions/ADR-0096-design-system-consolidation,
    decisions/ADR-0091-pack-integrity-and-build-pipeline,
    decisions/ADR-0043-dom-overlay-and-accessibility,
  ]
sourceFiles:
  [
    core/units/length-bounds.ts,
    core/commands/handlers/wall-commands.ts,
    core/commands/handlers/room-commands.ts,
    core/commands/handlers/opening-commands.ts,
    core/commands/handlers/furniture-commands.ts,
    editor/plan/length-rejection-message.ts,
    editor/plan/length-field.tsx,
    editor/design-system/field.tsx,
  ]
status: current
updated: 2026-06-19
---

# ADR-0108: Validate dimension commands in core and surface rejections inline

## Status

Accepted, landed. Core command handlers now reject out-of-range millimetre
dimensions before storing them, the dispatcher's existing rollback-on-throw path
carries the rejection back atomically, and the inspector's length fields show the
rejection as a recoverable inline error while keeping the text the user typed.

## Context

The inspector's numeric fields applied whatever the parser returned, with no
range or positivity check. A negative, zero, or absurdly large value committed
straight through as degenerate geometry. Typing `-5`, `0`, or `999999` into wall
thickness, room ceiling height, an opening's width, height, or sill, or a piece of
furniture's width, depth, or height parsed cleanly and stored as-is, so the model
ended up with a wall of negative thickness or a room three hundred kilometers tall.
Truly unparseable text was a silent no-op: the field swallowed the parse throw and
did nothing. Either way the user got no visible, recoverable feedback. The entered
value was accepted or dropped without comment.

The parser preserves a leading minus on purpose, and it is used in non-dimension
contexts where a sign can be meaningful, so the guard does not belong in the parser.
It belongs at the domain boundary, where a stored dimension has to make physical
sense.

## Decision

Validate at the core command handler, reject by throwing, and let the editor turn
that throw into an inline error. Three parts.

**Core command handlers own dimension validation.** A shared module,
`core/units/length-bounds.ts`, defines the named bounds, the error type, and the
guards. `MIN_POSITIVE_LENGTH_MM` is 1 mm, the smallest value the strict guard
accepts. `MAX_LENGTH_MM` is 100_000, a 100 m ceiling that reuses the existing
pack-manifest precedent (`MAX_DIMENSION_MM`), so the inspector and the pack
validator agree on what a sane millimetre dimension is. `InvalidLengthError` is a
named `Error` subclass carrying the human `label` (such as `'Thickness'`) and the
offending `valueMm`, so a caller can tell a domain-range rejection apart from any
other failure. Two guards enforce the rule: `assertPositiveLength` is strictly
positive and covers wall thickness, ceiling height, opening width and height, and
furniture width, depth, and height; `assertNonNegativeLength` allows zero and is
used only for an opening's sill height, since a door sits on the floor at a sill of
zero. Each handler calls the matching guard before it stores the value.

**Rejection travels by throw.** The dispatcher already catches a throwing handler,
replays the captured inverse so the failed command leaves no trace, and rethrows a
wrapper `Error` that carries the original cause. A guard that throws
`InvalidLengthError` therefore rolls back atomically: state is untouched and undo
history is untouched, exactly as if the command had never run. This needed no new
command-result type and no change to the dispatch signature. The rollback-on-throw
contract from the command framework was already the right channel, so the decision
here is to lean on it rather than add a parallel validation hook.

**The editor surfaces the rejection inline and recoverably.** The wrapper that
reaches the field carries the `InvalidLengthError` on its `cause`, not as the
top-level error, because the dispatcher rethrows its own wrapper. A shared helper,
`editor/plan/length-rejection-message.ts`, owns that detail: `lengthRejectionMessage`
returns the domain message when `err.cause instanceof InvalidLengthError` and null
otherwise. Each length field calls it from its catch, and on a domain rejection it
renders the message through the design-system `Field` `hint` seam, which already
wires `aria-describedby` from the control to the hint text. The field also sets
`aria-invalid` on the input and keeps the typed text in place, so the user can read
the error, fix the number, and try again. A later successful commit clears the
error.

Two exceptions are deliberate. An undefined ceiling height is not a rejection: it
clears the room's override, which is a legitimate edit, so the ceiling-height guard
runs only when a value is present. An opening's sill height of zero is legal, which
is why sill uses the non-negative guard while every other dimension stays strictly
positive.

This slice changed no `docs/specs/` file. It hardens an existing behavior rather
than introducing a format or spec change, so there is no spec-change ADR companion.

## Consequences

- Future dimension commands follow one convention: guard in the handler, reject by
  throw, and let the editor render the recoverable error. There is a single place
  to add a new bound or a new dimension to the rule.
- The editor inline-error path is shared rather than re-implemented per field. One
  helper detects the wrapped domain error and the `Field` hint seam carries the
  message and the `aria-describedby` wiring, so a new length field gets the same
  behavior by reusing both.
- The bounds converge with the pack validator's 100 m ceiling. The inspector and
  the furniture-pack check now reject the same absurd-max, so a dimension that the
  pack validator would reject on import cannot be typed in through the inspector
  either.
- Parse failures keep their existing silent no-op. Unparseable text is out of scope
  here; the guard only covers a value that parsed but fell outside the accepted
  range. Showing an error for an unparseable entry is a possible follow-up.
- Issue #237 (commit-on-blur) will route blur commits through this same hardened
  commit path, so a rejected blur keeps the text and shows the error rather than
  dropping it silently. The validation lands first precisely so the blur work can
  build on it.

## References

- ADR-0005 (the command pattern with framework-captured inverse, whose
  rollback-on-throw contract carries the rejection back atomically without a new
  result type).
- ADR-0027 (the units module and the millimetre storage target that these bounds
  are expressed in).
- ADR-0096 (the design-system consolidation, home of the `Field` hint seam the
  inline error renders through).
- ADR-0091 (the pack on-disk integrity check, whose `MAX_DIMENSION_MM` 100 m
  ceiling is the precedent these bounds reuse).
- ADR-0043 (the DOM overlay and editor accessibility work that established the
  `aria-describedby` and `aria-invalid` conventions the field reuses).
