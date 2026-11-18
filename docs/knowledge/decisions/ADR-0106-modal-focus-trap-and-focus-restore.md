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
    decisions/ADR-0116-shared-menu-button-keyboard-hook,
    decisions/ADR-0155-keyboard-and-command-model,
  ]
sourceFiles:
  [
    editor/design-system/use-focus-trap.ts,
    editor/design-system/use-focus-trap.test.tsx,
    editor/design-system/use-focus-trap-stack.test.tsx,
    editor/design-system/use-focus-trap-closing-key.test.tsx,
    editor/commands/command-palette.tsx,
    editor/commands/command-palette-shade-click.test.tsx,
    editor/commands/command-palette-keys.test.tsx,
    editor/commands/use-keybindings.ts,
    editor/commands/use-keybindings.test.tsx,
    e2e/tests/modal-dialogs-hold-keys-and-focus.spec.ts,
    editor/shell/discard-dialog.tsx,
    editor/shell/discard-dialog.test.tsx,
  ]
status: current
updated: 2026-11-18
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

## Update (2026-08-17): the discard prompt joined the trap

The deliberate non-modal recorded above stopped being deliberate once a UX audit
showed the prompt rendering a full viewport below the fold, where "lightweight"
read as "nothing happened". DiscardDialog now renders as a fixed overlay above
the frame and takes the same treatment this record prescribes for the palette:
initial focus on Cancel, the shared useFocusTrap, Escape as cancel, and focus
restored to the opener on close. Its aria-modal claim is now enforced, so the
References note calling it deliberately not retrofitted no longer applies. Known
gap for a follow-up: global keybindings registered on window stay live behind
the shade, so the palette can open behind an active prompt; the shared fix
belongs in the trap.

## Update (2026-11-18): the trap holds the keys and the pointer

Issue #595 took up the gap named above and added a second one. Probes in jsdom showed both. With
focus on the discard prompt's Cancel, `Mod+K` opened the palette under the prompt's shade, and
`Mod+Z`, `Delete` and `Mod+S` each ran their command. A click on the palette's shade dropped focus
to the page body. The palette stayed open, but Escape no longer reached it, and Tab walked into the
editor behind it. After a click on the discard prompt's shade, Shift+Tab left the prompt for a
control rendered before it. Both gaps are now handled in `useFocusTrap`, with one change in the
keybinding layer.

### Focus

The hook keeps focus inside with three rules.

- The container can hold focus. The hook gives it `tabindex="-1"` when it has no tabindex, and
  takes that back on unmount. A press on a part of the dialog that cannot take focus, such as its
  padding or the question text, then focuses the container instead of the page body.
- A mouse press outside the container leaves focus where it is. A `mousedown` listener on
  `document`, in the capture phase, cancels the default of a press whose target is outside the
  container. The click that follows still fires.
- Tab from a spot that is none of the focusable descendants, the container itself included, goes to
  the first of them, and Shift+Tab to the last. Before, the browser default applied there, which is
  how Shift+Tab left the discard shade.

The fix of 2026-08-17 for the discard prompt ("fix: hold focus on the prompt's shade and never
relabel a live prompt") put the trap and the Escape handler on the shade and gave the shade
`tabIndex={-1}` in `editor/shell/discard-dialog.tsx`. The shade now gets its tabindex from the
hook, and the dialog no longer sets it. The trap and the Escape handler stay on the shade. With the
trap on the panel, a press on the shade would leave focus on Cancel instead of on the shade, and the
existing test of a click on the shade expects the shade. The palette's trap sits on its panel, so a
press on the palette's shade leaves focus where it was and the search field keeps its caret. The
two dialogs differ here only because their traps sit on different elements.

### Keys

While a trap is the active one, a `keydown` does not reach the bubble-phase listeners on `document`
and `window`. The hook decides this when the dispatch starts. Each trap adds a capture-phase
`keydown` listener on `document`, `recordKeyDownInFlight`. When its trap is the active one, it
records the event in the module variable `keyDownInFlight` and adds one shared listener,
`stopKeyDownInFlight`, on `document.body`. When the event reaches the body in the bubble phase, that
listener clears the record, removes itself, and stops the propagation of the recorded event. It is
the one place where the hook holds a key back, and it stops no other event. If a handler inside the
dialog stops the event first, the shared listener stays until the next keydown reaches the body,
and it acts only on the event it recorded. React dispatches its handlers at the root element, which
sits inside the body, so the dialog's own handlers still receive every key first. `keyup` passes,
so a key held when the dialog opened is still released in walk mode, in the spacebar pan, and in the
held-Alt tracker.

Each trap also keeps a bubble-phase `keydown` listener of its own on the body, `pullFocusIntoTrap`.
It holds nothing back. For a keydown whose target is outside the container, with focus on the body
for example, it moves focus to the first focusable descendant, or to the container when it has
none. For a Tab from outside it also cancels the default, so that the next press does not walk on
from where focus was. Such a key started while the trap was active, so the shared listener holds it
back like any other.

The rule sits at the body because the listeners are many and their guards cannot see a dialog. The
editor has twelve bubble-phase `keydown` listeners on `window`, in `editor/plan/`,
`editor/commands/` and `bridge/`, and one on `document`, the underlay flyout's Escape. Their guards,
where they have one, decide by the focused element. Half of them use `ownsKeystroke`, which gives
a focused button only the arrows and Home and End, so with focus on Cancel or on a palette row
every other key read as not owned. With focus on the body every guard said the same. The held-Alt
tracker, the walk mode listener and the flyout's Escape have no guard at all. These alternatives
were weighed:

- `inert` on the rest of the page. It stops focus and clicks behind the shade, but keys typed
  inside the dialog still bubble to `window`, so each listener would still need its own check.
- A shared "a modal is open" signal read by the keybinding layer. It covers the command keys only.
  The clipboard chords, the wall run's Backspace, the furniture rotate key, keyboard authoring and
  walk mode listen elsewhere. The discard prompt also renders outside the palette's provider in
  `app/app.tsx`, so a React context would have no single home.
- Each dialog stops propagation on its own root. The palette already does this for Escape and
  Enter, but every new modal would have to remember it, and a key that starts outside the dialog
  would still get through.
- Each listener looks for an `aria-modal` ancestor. That changes the same files as `inert`.

The chosen rule is the third alternative done once, in the hook, for every dialog that uses it. It
changes none of the listeners.

The first version of the rule was wrong about the key that closes a dialog. In it, the trap's own
body listener stopped every keydown, and this record said that the dialogs' own
`stopPropagation()` on Escape and Enter was redundant while that rule existed. When a handler inside
the dialog closes it during a `keydown`, React in a browser commits the unmount before the event
reaches the body. The cleanup of the hook then removed the body listener, and the same `keydown`
went on to `document` and `window`, where the Escape ladder, deselect and the underlay flyout
listen. That order was inferred from how React schedules such an event, and shown in jsdom with
`flushSync` from `react-dom`, which commits in the same order: a `window` listener received the
Escape. Nothing leaked in the product, because both dialogs stop the propagation of Escape
themselves, and the palette also stops the Enter that runs a command. The commit "fix: hold back
the key that closes a focus trap" moved the decision to the start of the dispatch, as described
above. A `keydown` that starts while a trap is active is now held back even when the trap unmounts
while the event is handled, and the hold covers that one event only, so the next key reaches
`window` again. The dialogs keep their own `stopPropagation()` calls. Today they are a second guard,
and they matter again when the keyboard router of #691 replaces the rule at the body.

The rule has limits. It assumes that the React root renders inside `document.body`, which holds for
the app's `#root` in `index.html`. No dialog renders through a portal today, and a dialog portaled
straight into the body was not checked. A capture-phase listener, a `keydown` listener on the body
itself that runs before the shared stop, and an event dispatched straight at `document` or `window`
still see a key. Besides the trap's own `recordKeyDownInFlight`, the editor has one capture-phase
`keydown` listener, the one `useKeybindings` adds on `window`. It only cancels the browser default
of a bound chord and runs no command; the next part describes it.

A key that is down when a dialog opens keeps its effect until it is released. A walk key held as a
dialog opens keeps the walker moving behind the dialog until the key is released. Its `keyup`
passes, so no key gets stuck. An Alt pressed while a dialog is open is not seen as held after the
dialog closes, until the next key event. One more surface carries `role="dialog"`: the snap
precision popover in `editor/shell/snap-status.tsx`. It is not modal and has no trap, so keys
behind it still act. Nothing changes for it here.

Only the most recently mounted trap acts. A module-level list, `mountedTraps`, holds the mounted
containers in mount order, and each listener of a trap does nothing unless its container is last.
Without the list two traps would fight: the outer one would treat every key and press inside the
inner one as outside and pull focus back. React's development double mount mounts, cleans up, and
mounts again, so the push and the removal are symmetric, and a test pins that. That two modal
surfaces can never be open at once was read from the code and not proved. The only path found was
`Mod+K` behind the discard prompt, and the key rule shuts it.

### The browser default of a bound chord

With the key rule alone, a chord the editor binds would have reached the browser behind a dialog.
`useKeybindings` cancelled the default in the same bubble-phase listener that ran the command, and
the trap now keeps that listener from seeing the key. `Mod+S` behind the discard prompt would have
opened the browser's own save-page dialog. Two alternatives were weighed and rejected. Accepting
that until the keyboard router of #691 lands leaves a fault the user can see. Letting the trap
cancel the default of named chords would teach a design-system hook the editor's bindings, which
belong in `editor/commands/`.

This change has the module that owns the bindings cancel the default. `useKeybindings` adds two
listeners on `window` that share one private matcher, `findCommand`, which applies the
`ownsKeystroke` guard and then `resolveCommandForEvent`. The capture-phase listener only cancels the
default of a keystroke that an enabled command binds. The bubble-phase listener only runs the
command. The capture listener runs before the trap stops the key at the body, so the default is
cancelled behind a dialog. The bubble listener would run after that stop, so the dialog holds the
command back. With no
dialog open a bound chord runs once, as before. The keyboard spec says that `Cmd/Ctrl+S` "is never
borrowed" (ADR-0155), and that now holds behind a dialog too.

Escape, Delete, Backspace and the view digits are bound as well, so their default is now cancelled
in the capture phase whenever their command is enabled. Nothing in `editor/`, `bridge/` or `app/`
reads `defaultPrevented`. That was read in the code and not run in a browser.

### What a user sees

- The command palette stays open on a click on its shade, and the caret stays in its search field.
  No record asked for closing it on an outside press, as the header menus close under ADR-0116.
  Closing it that way would be a separate decision.
- `Mod+S` does not save while the discard prompt is open. It did before.
- The shortcut for the palette does not open it behind the discard prompt.
- Typing in the palette's search field no longer moves the walker in walk mode.
- A chord typed in a text field still reaches the browser, as before, because `ownsKeystroke` gives
  a field every key. `Mod+S` in the palette's search field still opens the browser's save-page
  dialog. This change keeps that rule; changing it would mean changing the guard in
  `editor/plan/keyboard-guard.ts`.

### Evidence and limits

The unit tests as run on 2026-11-18, all passing, in jsdom with the testing library's user events:

- `editor/design-system/use-focus-trap.test.tsx`: 15 tests. The new describe blocks are
  "useFocusTrap and the pointer", "useFocusTrap cleanup", and "useFocusTrap and the keys behind
  it".
- `editor/design-system/use-focus-trap-stack.test.tsx`: 6 tests, in "useFocusTrap with two traps
  mounted", "useFocusTrap and a key pressed with focus outside the trap", and "useFocusTrap under
  the development double mount".
- `editor/design-system/use-focus-trap-closing-key.test.tsx`: 5 tests, in "useFocusTrap and the key
  that closes it". Its dialogs close with `flushSync`, so the unmount commits during the keydown as
  it does in a browser.
- `editor/shell/discard-dialog.test.tsx`: 13 tests. New are the case "sends Shift+Tab after a click
  on the shade to the destructive answer, not to the frame behind" and the describe block
  "DiscardDialog and the editor behind it". Its Escape case binds an Escape command behind the
  prompt and checks that the command does not run while the prompt cancels.
- `editor/commands/command-palette-shade-click.test.tsx`: 1 test, in "the palette dialog and a click
  on its shade".
- `editor/commands/command-palette-keys.test.tsx`: 1 test, in "the palette dialog and the keys
  behind it".
- `editor/commands/use-keybindings.test.tsx`: 11 tests. The six in "useKeybindings and the browser
  default" are new.

jsdom cannot show two facts that the rules depend on: when React commits the unmount of a dialog
that a key closes, and that a cancelled `mousedown` keeps focus. A Playwright spec,
`e2e/tests/modal-dialogs-hold-keys-and-focus.spec.ts`, ran in Chromium on 2026-11-18, and its
11 tests passed. With the discard prompt open, the palette shortcut opened no palette and a
view key changed nothing; without a dialog each did its work. A click on the prompt's shade left the
prompt open with focus on the shade, Shift+Tab and Tab stayed inside, and Escape closed it and
returned focus to the control that opened it. A click on the palette's shade left the palette open
with focus in its search field. For each of the two dialogs, a bubble-phase `keydown` listener
added to `window` through the page recorded no key while the dialog was open and none for the
Escape that closed it, and it recorded the next key pressed after the dialog had closed. A
capture-phase listener on `document` read the real key event: `Mod+S` was default-prevented with
the prompt open and with no dialog, the save ran only with no dialog, and `F9`, which nothing binds,
kept its default.

An end-to-end test cannot ask a browser whether its own save-page dialog opened, so the proof for
`Mod+S` is the flag on the event. WebKit and Firefox were not run. Touch input and the right mouse
button were not tried. Walk mode with a locked pointer was not tried either: if `Mod+K` opens the
palette while the pointer is locked, where focus goes and what the first Escape does, which the
browser may spend on releasing the lock, are not known.

### What is left

- Epic #691 plans one keyboard router with a stack of scopes. Its modal scope replaces the key rule,
  with its record of the key in flight and its stop at the body, and the list of traps. The focus
  rules stay in the hook, because a router routes keys and does not manage focus.
- The third point of #595, the age of a recovery snapshot, moved to #714.
- Enter on a focused row of the command palette runs the first listed command as well as the
  focused row's, and asks the palette to close twice. It was found during this work and is not
  changed here. Issue #861 tracks it.
