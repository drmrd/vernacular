---
slug: decisions/ADR-0227-an-unavailable-toolbar-control-stays-focusable-and-gives-its-reason
title: 'ADR-0227: An unavailable toolbar control stays focusable and gives its reason'
type: decision
tags: [accessibility, toolbar, 3d-preview, aria, keyboard, disabled-controls]
related:
  [
    decisions/ADR-0155-keyboard-and-command-model,
    decisions/ADR-0198-open-doors-follow-the-scene-session,
  ]
sourceFiles:
  [
    bridge/react/toolbar-button.tsx,
    bridge/react/scene-nav-toolbar.tsx,
    bridge/react/scene-nav-toolbar.css,
    bridge/react/environment-controls.tsx,
    bridge/react/scene-object-controls.tsx,
    bridge/react/reason-description.tsx,
    editor/tools/tools-panel.tsx,
    editor/plan/opening-controls.tsx,
    core/registries/opening-kind.ts,
  ]
status: current
updated: 2026-11-21
---

# ADR-0227: An unavailable toolbar control stays focusable and gives its reason

## Status

Accepted on 2026-11-21 for issue #779. The 3D toolbar buttons follow it.

Update, 2026-11-21: issue #1023 brought the tools panel chips under the same pattern. The toolbar
button and the chip now share `ReasonDescription` (`bridge/react/reason-description.tsx`), which
renders the hidden span. An empty reason renders no span, so the control gets no description.

Update (2026-11-21): the hinge control in the opening inspector. The rule now applies beyond the
toolbar. The Flip hinge button in the opening inspector stays focusable and gives the reason "This
kind of opening has no hinge side to choose." when the opening kind has no hinge side. It stays
available for the swing, fold, and pivot families and for the casement window (`window-crank` with
`hingeEdge: 'jamb'`), because only there does the hinge change the plan symbol or the 3D motion.
For the other kinds, such as hung and sliding windows, fixed windows, awning and hopper windows,
sliding doors, and cased openings, a flip changes nothing visible. The rule lives in
`openingTypeHasHingeSide` in `core/registries/opening-kind.ts`, and the shared button is in
`editor/plan/opening-controls.tsx`. The flip command itself is unchanged, so a saved file or an
undo step that flips a hinge still works.

## Context

Several 3D toolbar controls cannot act in some states. The camera presets, Reset view, Select, and
Reveal interior need the orbit camera, Doorway needs a door in view, the underground levels toggle
applies to the whole-building view, and Close doors and windows needs an open door or window.

Each was a native `disabled` button whose reason sat in a `title` or nowhere. A native disabled
button cannot take focus, so a keyboard user never lands on it, and a `title` is not reliably announced.

## Decision

An unavailable toolbar button drops native `disabled` and carries `aria-disabled="true"`. It stays
in the tab order, so it is announced with its name, its pressed state when it is a toggle, and its
reason.

The reason is a hidden `<span>` next to the button, and the button points at it with
`aria-describedby`. A node referenced directly counts toward the description even when hidden, so
the text is read on focus and not repeated in browse mode. The same string stays in `title` for
mouse users. The toolbar shows no extra text.

Activation is swallowed in one place. A native button turns a mouse click, Enter, and Space into a
single `click` event, so one early return in `onClick` covers all three. No key handler is needed.

### One shared button

`ToolbarButton` in `bridge/react/toolbar-button.tsx` holds the pattern. It lives in `bridge/`
because `bridge/` cannot import `editor/`, and `editor/` can import `bridge/`, so the tools panel
can adopt it later. Its props are `label` (the accessible name), `onActivate`, and optional `unavailableReason`,
`pressed`, `title`, and `className`. The old toolbar toggle folds into it.

### The slider exception

The color-temperature slider stays natively disabled. It has a visible note already, and an
`aria-disabled` range still moves under the arrow keys and a drag.

## Consequences

- The toolbar styles key on `[aria-disabled='true']` instead of `:disabled`, and each
  `:hover:not(:disabled)` becomes `:hover:not([aria-disabled='true'])`.
- The jest-dom `toBeDisabled` matcher ignores `aria-disabled`. Tests assert
  `toHaveAttribute('aria-disabled', 'true')`, and for an available control they also assert that
  the attribute is absent. Playwright's `toBeDisabled` honors `aria-disabled`.
- ADR-0155 needs no change. The guard that lets a focused button keep Enter checks the tag name, so
  Enter stays with an `aria-disabled` button and is swallowed. The walk keys use neither Enter nor
  Space.
- The open consequence in ADR-0198, that a disabled control gives its reason only in `title`, is
  closed for the toolbar buttons.
- The tools panel chips had the same defect: they were `aria-disabled` and focusable, but the
  reason sat only in `title`. Issue #1023 closed it. Each unavailable chip now points
  `aria-describedby` at the shared `ReasonDescription` span and keeps the same text in `title`.

## Alternatives considered

Keep native `disabled` and show one visible note per group. A disabled button still cannot take
focus, so a keyboard user never meets the control or its note, and a screen-reader user hears the
note only in browse mode, away from its control. The notes also crowd the toolbar.

Show a tooltip on focus and hover. It needs a new component and adds nothing for assistive
technology beyond `aria-describedby`, so it is deferred.

## References

- Issues #779 and #1023, ADR-0155 (keyboard and command model), ADR-0198 (open doors).
