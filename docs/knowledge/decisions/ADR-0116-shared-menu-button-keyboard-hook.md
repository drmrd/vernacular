---
slug: decisions/ADR-0116-shared-menu-button-keyboard-hook
title: 'ADR-0116: Shared keyboard hook for header dropdown menus'
type: decision
tags: [editor, design-system, accessibility, a11y, wcag, keyboard, menu, dropdown, hook]
related:
  [
    decisions/ADR-0115-keyboard-plan-authoring,
    decisions/ADR-0113-component-local-contrast-guards,
    decisions/ADR-0112-minimum-interactive-target-sizes,
  ]
sourceFiles:
  [
    editor/design-system/use-menu-button.ts,
    editor/shell/project-menu.tsx,
    editor/shell/export-menu.tsx,
  ]
status: current
updated: 2026-06-20
---

# ADR-0116: Shared keyboard hook for header dropdown menus

## Status

Accepted, landed. The two header dropdowns, Project and Export, now share one keyboard contract: the
menu opens with focus on its first item, the arrow keys move between items, Escape closes the menu and
hands focus back to the trigger, and a pointer press anywhere outside the menu dismisses it. The
project trigger also carries a visible label. This continues the alpha-hardening accessibility family
alongside the keyboard authoring path in ADR-0115.

## Context

Both header menus declared the right ARIA roles but backed none of the behavior those roles promise. The
project menu hung off a bare down-chevron glyph with an `aria-label` and no visible text, so it read as
decoration rather than the home for New, Open file, Open folder, and recent projects. Each dropdown set
`role="menu"` and `role="menuitem"` yet wired no key handling at all: no Escape to close, no arrow
movement between items, no dismissal when the pointer went elsewhere, and no return of focus to the
trigger once the menu closed. Because neither menu closed on an outside press, opening one while the
other was open left both on screen at the same time.

For a keyboard or assistive-technology user this is a WCAG 2.1.1 (Keyboard) gap on a primary navigation
surface, and the unlabeled trigger is a discoverability and a label-in-name (WCAG 2.5.3) problem. The
two menus were near-identical copies, so any fix written into one would have to be copied into the
other and kept in step by hand.

The repository already had the right raw materials. The underlay flyout carried a small
`useDismissOnOutside` helper for Escape and outside-press dismissal, the design system had a
`useFocusTrap` hook that locates focusable descendants by query rather than by threading a ref through
every child, and the `labeled` icon-button variant already rendered an icon beside a text label
elsewhere in the header.

## Decision

Put the open-and-keyboard contract in one place, `editor/design-system/use-menu-button.ts`, and have
both menus consume it. A consumer spreads `triggerProps` onto its trigger and `menuProps` onto the
`role="menu"` list, attaches the returned `containerRef` to the wrapping element, and gates the list on
`open`. The hook finds the trigger and the items by querying inside the container, the same approach
`useFocusTrap` takes, so menu items need no individual refs and a menu can add or drop items freely.

The hook owns four behaviors. Opening the menu moves focus to the first item. The arrow keys rove
focus across the items and wrap at each end. Escape returns focus to the trigger and closes the menu. A
pointer press outside the container closes the menu without moving focus, since the user is acting
elsewhere.

Mutual exclusion falls out of that last behavior rather than needing its own machinery. When one menu
is open and the user presses on the other trigger, that press is outside the first menu's container, so
the first menu closes during the same gesture and the second trigger then opens its own menu. No shared
registry or cross-component coordinator is involved.

The project trigger gains a visible "Project" label through the `labeled` icon-button variant, and its
redundant `aria-label` is dropped so the visible text is the accessible name. The export trigger
already showed the word "Export", so it needed no label change.

## Consequences

One hook now defines how a header dropdown behaves, so a future menu adopts the same keyboard contract
by consuming it rather than by copying chrome, and a correction lands once. The menus are smaller: each
dropped its local open state and its hand-rolled ARIA wiring.

Two refinements are deliberately left for later. The trigger does not yet open the menu on ArrowDown,
which the menu-button pattern usually offers; the slot for that handler is reserved but inert until a
test drives it. The items stay in the normal tab order rather than using a roving tabindex that would
let a single Tab step out of the whole menu. Neither gap blocks a keyboard user from operating either
menu today, and both can be added on the same hook without touching the consumers.

Cross-menu exclusion by keyboard alone, tabbing from an open menu to the other trigger and pressing
Enter, is not handled, because focus rests on a single trigger at a time and the reported problem was
the pointer case. The home visual-regression baseline shifts because the header now shows the word
"Project" where a chevron stood.
