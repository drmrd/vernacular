---
slug: decisions/ADR-0106-modal-focus-trap-and-focus-restore
title: 'ADR-0106: Modal focus-trap and focus-restore pattern'
type: decision
tags:
  [
    accessibility,
    design-system,
    modal,
    dialog,
    focus-trap,
    focus-restore,
    command-palette,
    aria-modal,
    keyboard,
  ]
related:
  [
    decisions/ADR-0096-design-system-consolidation,
    decisions/ADR-0104-unsaved-changes-guard-and-dirty-state-model,
  ]
sourceFiles: [editor/design-system/use-focus-trap.ts, editor/commands/command-palette.tsx]
status: current
updated: 2026-06-19
---

# ADR-0106: Modal focus-trap and focus-restore pattern

## Status

Accepted, landed. The command palette is now a real modal. A reusable
`useFocusTrap` hook in the design system records the opener, moves focus into the
dialog on open, cycles Tab and Shift+Tab inside the dialog, and restores focus to
the opener on close. The palette adopts the hook and also restores focus on its
own explicit close so that its `aria-modal="true"` claim is honest.

## Context

The Cmd/Ctrl+K command palette already declared `role="dialog"` and
`aria-modal="true"`, but it did not enforce modality. Tab walked straight out of
the dialog and into the editor behind it, and closing the palette left focus
wherever it happened to land rather than returning it to the control that opened
the palette. The markup promised a modal; the behavior delivered an overlay that
keyboard and screen-reader users could fall out of.

The palette is the codebase's first true modal. The dirty-state guard dialog from
ADR-0104, `DiscardDialog`, was a deliberate non-modal: it renders as a lightweight
`alertdialog` banner with no `aria-modal` and no focus trap, so there was no
existing trap to lift and reuse. Making the palette honest meant building the trap
rather than borrowing one.

The styling half of issue #239 needed no decision of its own. Centering the
surface through `.ds-menu-surface` and treating the search box as a design-system
field are plain applications of the consolidated primitives from ADR-0096, so they
land as ordinary usage. What earns a record is the modality behavior: the trap and
the focus restore.

## Decision

Add one reusable hook to the design system, adopt it in the palette, and have the
palette restore focus on its own explicit close.

**A reusable focus-trap hook.** `useFocusTrap` in
`editor/design-system/use-focus-trap.ts` returns a container ref and takes over
focus management for whatever is mounted inside that container. On mount it records
the previously focused element as the opener and moves focus to the first focusable
descendant. While mounted it intercepts Tab and Shift+Tab so that focus wraps
inside the container: Tab off the last focusable element returns to the first, and
Shift+Tab off the first returns to the last. On unmount it restores focus to the
opener. The hook carries the whole contract, so any future modal gets trapping and
restore by holding one ref.

**A conditional restore that does not fight the caller.** The unmount restore is
guarded. If, by the time the hook tears down, focus already sits on a live,
connected element outside the container, the hook treats that as a deliberate
handoff by the caller and leaves it alone. This is what keeps a double restore from
happening: a caller that moved focus itself on an explicit close does not get
overwritten, and the hook does not redundantly re-focus an element that is already
focused. Unmounting a child blurs it back to `<body>`, and that case still falls
through to the restore, so a plain unmount with no caller handoff still returns
focus to the opener.

**The palette adopts the hook and restores on explicit close.** The command
palette holds the trap ref on its dialog element and adds a focus-restoring close
of its own. Its Escape handler and its run-command path both move focus back to the
opener as part of closing, which is the deliberate handoff the hook's conditional
restore is built to respect. Between the hook and the palette's own close, focus
enters the dialog on open, stays inside it for the life of the dialog, and returns
to the opener however the dialog is dismissed. The `aria-modal="true"` attribute
now describes what actually happens.

This slice changed no `docs/specs/` file. It hardens the accessibility behavior of
an existing surface rather than introducing a file format or a spec change, so
there is no spec-change ADR companion.

## Consequences

- The command palette is a real modal. Keyboard focus enters it on open, cycles
  inside it under Tab and Shift+Tab, and returns to the opener on Escape, on
  running a command, and on any unmount. Its `aria-modal` claim is no longer a
  promise the behavior breaks.
- Future real modals reuse this hook rather than re-deriving trap and restore at
  each call site. The contract lives once in the design system, next to the other
  consolidated primitives.
- `DiscardDialog` from ADR-0104 stays a non-trapping `alertdialog` banner on
  purpose and is not retrofitted here. It is a short confirm-or-cancel prompt, not
  a surface a user navigates within, and giving it a trap was out of scope for this
  slice. If a later need argues for it, adopting the same hook is the path.
- This composes with the design-system consolidation rather than replacing it.
  ADR-0096 owns the surface and field styling that the palette uses; this record
  owns the modality behavior layered on top. The styling half of issue #239 is a
  plain application of ADR-0096 and needs no decision of its own.
- The conditional restore is the subtle part. It assumes a caller that moves focus
  on close moves it to a live, connected element outside the container; a caller
  that moved focus to a detached or disconnected element would fall through to the
  hook's own restore. The palette's explicit close satisfies the assumption, and
  the guard's comment records the reasoning for the next adopter.
- The listbox and arrow-key combobox model sketched in the issue body is
  explicitly deferred to a follow-up. This slice makes the dialog modal and
  keyboard-honest; turning the command list into an arrow-navigable listbox with a
  combobox input is separate work.

## References

- ADR-0096 (the design-system consolidation; the surface and field primitives the
  palette styling reuses, and the home for this shared hook).
- ADR-0104 (the unsaved-changes guard, whose `DiscardDialog` stays a non-trapping
  `alertdialog` banner and is deliberately not retrofitted with this trap).
