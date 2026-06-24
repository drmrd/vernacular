---
slug: decisions/ADR-0121-opening-type-conversion-resets-type-defining-dimensions
title: 'ADR-0121: Opening type conversion resets the type-defining dimensions'
type: decision
tags: [core, openings, doors, windows, element-types, commands, registry]
related:
  [
    decisions/ADR-0038-openings-doors-and-windows,
    decisions/ADR-0006-registry-pattern,
    decisions/ADR-0073-opening-drag-to-resize-handles,
  ]
sourceFiles:
  [
    core/registries/opening-kind.ts,
    core/registries/element-types.ts,
    core/commands/handlers/opening-commands.ts,
  ]
status: current
updated: 2026-06-23
---

# ADR-0121: Opening type conversion resets the type-defining dimensions

## Status

Accepted, landed. Changing an opening's type now resets its sill height and height to the new
type's registry defaults when the change crosses between a door and a window, while keeping the
opening's place in the wall. A change that stays within the same kind, such as a single door to a
double door, still keeps every dimension.

## Context

The first version of opening-type conversion preserved all dimensions. That is the right call
for a swap inside one kind, where the user has already tuned the width and height and only wants a
different operation. It reads wrong across kinds. Convert a door to a window and the window keeps
the door's sill height of zero and its two-meter height, so it sits on the floor and runs almost to
the ceiling. The result is a shape no one would call a window.

The placement attributes and the type-defining attributes pull in different directions here. The
host wall, the position along that wall, and the width describe the same hole in the wall before and
after the change, so the user's intent for them carries over. The sill height and the height are
what make a door a door and a window a window, so when the kind changes they should follow the new
kind rather than linger from the old one.

## Decision

Split an opening element type into a door or a window by its operation family, and reset the
type-defining dimensions only when that kind changes.

### Classify by family, not a new field

`openingKindOfType` in `core/registries/opening-kind.ts` maps a type id to `'door'` or `'window'`
by reading the `opening.family` already recorded for each type in `builtinElementTypes`. The swing,
slide, fold, pivot, and cased families are doors; the fixed and crank window families are windows.
An unknown id, or a non-opening type, returns `undefined`.

The family already carries the door-or-window distinction, so the classifier is a pure lookup over
existing registry data with no schema change and no new stored field. This follows the registry
pattern in ADR-0006 and builds on the family model from ADR-0038. The classifier lives in its own
module rather than in the element-types data file, so that file stays pure registry data.

### Reset on a cross-kind change, preserve otherwise

The `setOpeningType` command compares the kind of the old type with the kind of the new type. When
both are known and they differ, the command adopts the new type's `defaultSillHeight` and
`defaultHeight` and keeps the host wall, position, width, and orientation. When the kinds match, or
either kind is unknown, the command changes only the type and leaves every dimension in place, which
is the earlier behavior. The change is a command, so it is undoable and any reset is recoverable.

## Consequences

- Converting across kinds produces a legible result by default. A door becomes a window that sits at
  a window's sill, and a window becomes a door that reaches the floor, without a manual fix-up.
- Width and position survive every conversion, so the opening stays where the user put it and as wide
  as they made it.
- The door-or-window split is derived, so adding a new opening type needs only a correct family for
  the conversion behavior to apply. No call site enumerates the types.
- The reset is keyed on kind, so a future third kind of opening would need its own entry in the
  classifier. The `undefined` fallback keeps an unrecognized type safe in the meantime by preserving
  its dimensions.

## References

- ADR-0038 (openings as typed wall-hosted entities, the source of the operation-family model).
- ADR-0006 (the registry pattern that holds the element types and their defaults).
- ADR-0073 (opening drag-to-resize, the other path that edits opening dimensions).
