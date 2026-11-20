---
slug: decisions/ADR-0155-keyboard-and-command-model
title: 'ADR-0155: Adopt the keyboard and command model as a target'
type: decision
tags: [keyboard, command-model, shortcuts, interaction-grammar, accessibility, keybindings]
related:
  [
    decisions/ADR-0154-arris-visual-design-language,
    decisions/ADR-0106-modal-focus-trap-and-focus-restore,
  ]
sourceFiles:
  [
    docs/specs/2026-07-06-keyboard-and-command-model.md,
    docs/specs/2026-07-06-arris-visual-design-language.md,
    docs/specs/2026-06-01-vernacular-design.md,
    editor/commands/use-keybindings.ts,
    editor/design-system/composing-key.ts,
    editor/design-system/composing-key.test.tsx,
    editor/commands/command-palette-composing.test.tsx,
    editor/metadata/site-editor-composing.test.tsx,
    editor/shell/project-menu-composing.test.tsx,
    editor/shell/floor-switcher-composing.test.tsx,
    editor/environment/environment-scenes-composing.test.tsx,
    editor/plan/activation-keys.ts,
    editor/plan/entity-proxy.tsx,
    editor/plan/use-plan-authoring.ts,
    editor/plan/use-plan-interaction.ts,
    editor/plan/use-plan-authoring-handled-keys.test.tsx,
    editor/plan/use-plan-interaction-handled-keys.test.tsx,
    e2e/tests/keyboard-authoring.spec.ts,
    editor/plan/use-escape-to-select.ts,
    editor/plan/use-escape-to-select.test.ts,
    editor/plan/use-plan-authoring-run-scope.test.ts,
    editor/plan/run-scope.ts,
    editor/plan/use-discard-pointer-wall-run.ts,
    editor/plan/use-dimension-tool.ts,
    editor/plan/use-plan-interaction-run-scope.test.ts,
    editor/plan/use-dimension-tool.test.ts,
    e2e/tests/journeys/cancel-wall.spec.ts,
    e2e/tests/journeys/switch-floor.spec.ts,
  ]
status: current
updated: 2026-11-20
---

# ADR-0155: Adopt the keyboard and command model as a target

## Status

Current. Ratified by the owner on 2026-08-14, chosen originally on 2026-07-06 as an outcome of the
purpose-first UX review of the whole product surface. The keyboard and command model is adopted as
the target interaction grammar and is recorded as a spec
(`docs/specs/2026-07-06-keyboard-and-command-model.md`).

This is a direction decision, not a description of the shipped app. It has not yet been mapped
against the shipped editor's current shortcuts, and the running editor keeps its existing bindings
until that reconciliation lands. It is the companion to the Arris visual language
([[ADR-0154-arris-visual-design-language]]), ratified from the same review; both are now current as
targets, not yet the shipped state.

## Context

Vernacular is a keyboard-first tool: a fluent user drives it from the keys with a hand rarely
leaving the drawing. The default shortcut set and the rule that resolves them are therefore part of
the product's core rather than a preferences afterthought.

The purpose-first UX review designed the whole surface blind to the current implementation. Dozens
of those area designs left their shortcuts unassigned, each deferring to "the command registry,
settled later." No artifact was chartered to settle them. Left that way, the bindings would be
assigned piecemeal at build time, which would recreate the exact key collisions the review spent a
pass removing, and would leave the keyboard-first promise unfinishable.

The keyboard spec settles that debt. It assigns a concrete default to every deferred binding,
records the scope each lives in, and states one precedence ladder that decides which command a key
fires when several claim it. Because the ladder lets one physical key carry different verbs in
disjoint scopes, the model reuses scarce keys without collision, and it routes low-frequency
actions to the command deck by name rather than spending fragile global chords on them.

Two limits follow from the review being blind to the codebase. The model has not been reconciled
with the editor's current shortcuts, so recording it as shipped would misstate what the product
does today. And several of its global chords use modifier combinations that some browsers or
operating systems intercept before the page sees them; that deliverability audit has not run, and
the reuse of Tab mid-gesture has not been proven under a screen reader.

## Decision

Adopt the keyboard and command model as the target interaction grammar and record it as a spec at
proposed status.

- **The precedence ladder is the single conflict-resolution rule.** Every binding in the spec is a
  consistent projection of one ordering, from a focused text field at the top down to the global
  frame layer at the bottom. Build work resolves key conflicts against that ladder rather than
  case by case.
- **Daily verbs earn an engraved default; rare verbs ride the command deck by name.** The deck is
  the home for low-frequency actions, and by-name access keeps them reachable without spending a
  scarce chord.
- **Global chords are provisional pending the deliverability audit.** Every `Ctrl/Cmd+Shift` default
  is marked provisional and falls back to the deck-by-name path if the audit finds it intercepted.
  The command stays reachable by name either way.
- **The scoped mid-gesture Tab earns a spike before it is a build commitment.** Reusing Tab for the
  snap-candidate cycle, the quantity latch, and entity walking is central to the model and is the
  behavior most at risk under assistive technology. It graduates from the spec to a build slice
  only after the screen-reader spike confirms it or supplies a fallback.
- **This ADR is current now as the ratified target; the shipped-editor reconciliation comes
  later.** The shipped editor's shortcuts stay authoritative for what the product does today until
  that reconciliation, which includes mapping this model against the editor's existing bindings and
  a migration plan for any binding that moves. Until then the spec reads as a target, not a
  description of the shipped app.

## Consequences

- The durable design record now names one keyboard model, so future design and build work converges
  on it instead of re-deriving bindings and re-fighting collisions at each tool.
- The shipped app is unchanged by this decision. A reader who diffs the running editor's shortcuts
  against this model will find they disagree, and that is expected until reconciliation.
- Because the model is ratified as a direction but not yet shipped, no README, release note, or
  other external text may describe these as the product's keyboard shortcuts.
- The model depends on the Arris language target it is the grammar for (ADR-0154), and it carries
  open dependencies recorded as GitHub work: the scoped-Tab spike, the chord-deliverability audit,
  and the numeric-storage decision that the entry grammar assumes.
- Promotion of any specific binding into build work waits on the audit and spike that clear it and
  on the reconciliation that maps it onto the shipped editor.

## References

- [[ADR-0154-arris-visual-design-language]]: the companion visual language this model is the
  interaction grammar for; both are ratified targets from the same review.
- `docs/specs/2026-07-06-keyboard-and-command-model.md`: the keyboard and command spec this decision
  adopts.
- `docs/specs/2026-07-06-arris-visual-design-language.md`: the Arris visual language spec.
- `docs/specs/2026-06-01-vernacular-design.md`: the governing design specification.
- GitHub follow-ups this model depends on: issue #497 (scoped Tab under screen readers), issue #498
  (chord-deliverability audit), issue #496 (numeric storage model).

## Update (2026-08-17): one owner per keystroke

An audit of the shipped editor's own shortcuts found five defects that share one cause. Nothing in
the editor owned a given key, so every hook listening for it answered. Both the delete-selection
command and the plan's selection keyboard claimed Delete, so one press recorded two history
entries and the first undo appeared to do nothing. Arrow keys nudged the plan from any focus that
was not a text field, the tools panel's radio buttons included. Backspace under the wall tool
undid whatever sat on top of the undo stack, which was often not the segment that run had drawn.
Escape cancelled a run and left the tool in the same press. The palette listed a set of commands
assembled separately from the set the keys ran.

The fix gives each key an owner instead of adding bindings, which is this ADR's precedence ladder
applied to the code as it stands:

- **One guard decides whether a keystroke belongs to a control.** `ownsKeystroke` in
  `editor/plan/keyboard-guard.ts` replaces the two predicates that had drifted apart. A field owns
  every key typed into it. A button owns only the arrows and Home and End it roves with, so a tool
  chip still holding focus after a click cannot swallow Escape or Delete.
- **A key has one owner.** Delete and Backspace belong to the delete-selection command, which now
  also removes selected furniture, the piece of coverage that only the plan hook used to provide.
  The plan's selection keyboard keeps the nudge and the clipboard.
- **Escape is a ladder.** The first press cancels a run in progress and leaves the tool armed. The
  second returns to the select tool. Deselecting happens only when neither applies, which holds
  because the selection is now dropped whenever the editor leaves the select tool. A tool that
  cancels a run claims the keystroke; the return to select is decided once the keystroke has
  finished reaching every listener, because the tools that cancel live in sibling hooks whose
  subscription order nothing guarantees. The dimension tool joins the ladder with a cancel of its
  own, and both it and calibrate are tools Escape now leaves. That cancel covers both halves of a
  measurement, and has since 2026-08-18. At first it reached only the candidate a keyboard run had
  placed, so an Escape pressed in the middle of a mouse measurement claimed nothing and fell
  through to the return to select. The start point survived that trip, and the next click could
  still pair with it. Calibrate gained a rung of its own on the same date, where it had none
  before: a first click already placed on an underlay clears in place, and the distance typed into
  the flyout stays where the user left it. The dimension tool also drops a half-taken measurement
  when its tool is left, so no start point outlives the tool that took it.
- **The command set is assembled once.** `createCommandSet` builds it, the keybinding layer
  publishes what it bound, and the palette lists that, so a command cannot be reachable by key and
  missing from the palette. Save appears in the palette for the first time as a result. Each row
  prints its first binding in the glyphs the reader's own keyboard carries, and the search matches
  that text as well as the name. This displays bindings the editor already ships. It promotes
  nothing new, which this ADR still defers to the chord-deliverability audit.

Two smaller repairs follow the same rule. The wall tool's Backspace steps back only the segment
that run committed, and stands down entirely once anything else has been recorded, rather than
calling the session's undo blind. An armed furniture item is disarmed when its tool is left, so the
arm state cannot outlive the tool that places it.

The reconciliation this ADR promised is not finished. What landed is the shipped editor's own
keyboard made coherent, not the spec's bindings adopted. Two known gaps remain: the editor shell
still assembles its command list by hand instead of calling `createCommandSet`, and
`editor/plan/use-viewport-controls.ts` keeps a third focus predicate of its own for the spacebar
pan.

## Update (2026-08-17): phantom shell hints removed

Issue #561 found that the editor shell's Grid and Dimensions toolbar buttons carried
tooltip text reading "Grid (G)" and "Dimensions (D)", which implied G and D keybindings
that were never registered. The fix drops those parenthetical hints, so the buttons now
read "Grid" and "Dimensions" with no shortcut claim. This only cleans up stale UI text;
it does not decide anything about the keyboard model itself. Any future G or D binding
still has to clear this ADR's chord-deliverability audit before it can be promoted, and
only then would it belong back on the toolbar. The visual-design-language spec
(docs/specs/2026-06-13-visual-design-language.md, header section) prescribed the same
phantom tooltip text; the same change rewrites that passage to match, so the spec no
longer instructs the hints this update removed.

## Update (2026-11-18): bound chords behind a dialog

An open modal dialog now holds every keydown back from the editor's bubble-phase listeners, as the
ADR-0106 update of the same date records. `useKeybindings` therefore splits its work into two
listeners on `window`. The capture-phase one cancels the browser default of a keystroke that an
enabled command binds, before the dialog can hold it back. The bubble-phase one runs the command,
and the dialog stops that one. A bound chord behind a dialog does nothing and does not reach the
browser, so "never borrowed" holds for `Cmd/Ctrl+S` there too. With no dialog open a bound chord
runs once, as before. A chord typed in a text field still keeps its default, because the field owns
it.

## Update (2026-11-18): a key of a text composition belongs to the input method

A person who types with an input method, for Japanese, Chinese or Korean text or for full-width
digits, presses Enter to confirm a candidate and Escape to cancel it while the text is still being
composed. The browser still sends a `keydown` for that key. Issue #863 found that the command
palette took a composing Enter as its own: the first filtered command ran and the palette closed. A
composing Escape closed the palette. Each field of the site editor committed the half-composed
value on a composing Enter.

The rule sharpens the top of the precedence ladder, where a focused text field owns its keys: a key
that belongs to a text composition is the input method's key, not the app's. A handler that acts on
Enter or Escape leaves such a key alone. It runs no command, closes or cancels nothing and commits
nothing.

- **One helper tells such a key.** `isComposingKey` in `editor/design-system/composing-key.ts`,
  exported from the `editor/design-system` index, takes a DOM keyboard event or a React one and
  reads the native event. It returns true when `isComposing` is set or when `keyCode` is 229, which
  means "processed by an input method". Some engines do not set `isComposing` for such a key, the
  key that ends a composition for instance, and report key code 229 instead. Which engines do so
  was not checked here. `keyCode` is deprecated, but for those engines it is the only signal, so
  the helper still reads it.
- **The command palette follows it.** Its key handler, `createKeyDownHandler` in
  `editor/commands/command-palette.tsx`, returns before its Escape and Enter branches. It does not
  stop the propagation of such a key. While the palette is open the focus trap already holds every
  `keydown` back from the editor's listeners (ADR-0106), so the key does not reach the shortcuts
  behind the dialog either.
- **The site editor follows it.** `useCommitOnBlur` in `editor/metadata/site-editor.tsx`, the
  handler that the latitude, longitude, north bearing and timezone fields share, returns early. The
  pending-edit flag stays set, so the plain Enter or the blur that comes later still commits, once.
- **Three inline rename fields follow it.** They are the project name field of the project menu
  (`editor/shell/project-menu.tsx`), the floor name field of the floor switcher
  (`editor/shell/floor-switcher.tsx`) and the scene name field of the lighting scenes
  (`editor/environment/environment-scenes.tsx`). Before, an Escape that cancelled a candidate also
  cancelled the rename, and the typed name was lost. Now each cancels only on
  `event.key === 'Escape' && !isComposingKey(event)`. A composing Escape leaves the field open with
  the typed text, a later plain Escape cancels, and a submit commits the name once. These fields
  commit through their form's submit, not in a `keydown` handler, so they need no check on Enter.
  Whether a browser submits such a form on a composing Enter was not checked. The tests that a
  composing Enter commits nothing cannot show it, because jsdom submits no form on a `keydown`.

The rule does not cover every handler of a text field that acts on Enter or Escape yet. Under
`editor/plan/` these are the room name editor (`room-name-editor.tsx`), the room sub purpose editor
(`room-sub-purpose-editor.tsx`), the name field of the furniture inspector
(`furniture-inspector.tsx`), the length field (`length-field.tsx`) and the angle field
(`angle-field.tsx`), which commit on Enter. The underlay flyout (`underlay-menu.tsx`) is the other
one. Its `useDismissOnEscape` adds a `keydown` listener on `document` that closes the flyout on any
Escape, with no guard. The flyout holds the known distance field of calibration, so a composing
Escape typed there closes the flyout, as read from the code. Issue #863 stays open for these six.

The other handlers that act on these keys hold no text field and need no check: the menu of
`use-menu-button.ts`, the discard dialog, the entity proxies in `entity-proxy.tsx` and their
container in `use-overlay-keyboard.ts`. The plan's window listeners that act on Enter or Escape,
the tool handlers in `authoring-tool-handlers.ts`, the wall run in `use-plan-interaction.ts`,
`use-dimension-tool.ts`, `use-calibration-arming.ts` and `use-escape-to-select.ts`, skip a key whose
target is a text field through `isTextEntry` or `ownsKeystroke` in `editor/plan/keyboard-guard.ts`,
so a composing key does not reach them. Two other window listeners, the spacebar pan and fit key in
`use-viewport-controls.ts` and the held-Alt tracker in `use-held-alt-key.ts`, do not use that guard
but act on other keys.

No run with a real input method in a browser was made. The tests fire `keydown` events with
`isComposing` set, or with key code 229, in jsdom. As run on 2026-11-18, all passing:

- `editor/design-system/composing-key.test.tsx`: 6 tests, on DOM and React keyboard events.
- `editor/commands/command-palette-composing.test.tsx`: 5 tests. A composing Enter, by either
  signal, runs no command and does not close the palette; a composing Escape does not close it; the
  next plain Enter runs the first command once and closes once; a plain Escape closes once.
- `editor/metadata/site-editor-composing.test.tsx`: 20 tests, five for each of the four fields. A
  composing Enter, by either signal, commits nothing; the plain Enter or the blur after it commits
  once; a plain Enter with no composition commits once.
- `editor/shell/project-menu-composing.test.tsx`, `editor/shell/floor-switcher-composing.test.tsx`
  and `editor/environment/environment-scenes-composing.test.tsx`: 6 tests each. A composing Escape,
  by either signal, keeps the rename open with the typed name; the plain Escape after it cancels; a
  submit after it commits the name once; a composing Enter commits nothing; a plain Escape cancels
  without a commit.

That makes 49 tests in six files.

## Update (2026-11-19): an entity proxy owns its Enter and Space

Issue #906 found that one Enter on a focused entity proxy did two things under an authoring tool. The
proxy selected the entity, and the authoring key listener dropped at the keyboard candidate. Under
the Door tool that placed a door that the user did not ask for. With a pointer wall run open, the
same Enter also ended the run.

The proxy now owns the key. `EntityProxy` prevents the default when it selects. Two listeners skip an
Enter or Space press whose default an element already prevented: the key listener of the keyboard
tools (`listenForAuthoringKeys` in `editor/plan/use-plan-authoring.ts`) and the key listener of the
pointer wall run (`useWallKeyboard` in `editor/plan/use-plan-interaction.ts`). The proxy and both
listeners read the rule from `editor/plan/activation-keys.ts`.

The rule covers only Enter and Space. The list of the proxies prevents the default of every Escape,
and the `deselect` command does so while something is selected. Escape must still cancel an open wall
run or measurement, so a handled Escape still reaches the tool. A handled arrow key still reaches it
too. Issue #910 asks what it should do.

One path of the same kind stays open. A focused button other than the chip of the armed tool does not
own Enter. Under an authoring tool its Enter drops at the keyboard candidate, and the button does not
activate. Issue #911 tracks it. Enter on the chip of the armed tool drops at the candidate by design.

Tests: `editor/plan/use-plan-authoring-handled-keys.test.tsx` and
`editor/plan/use-plan-interaction-handled-keys.test.tsx` go through the real listeners, the real
proxy, and the real key handler of the list. Two journeys in `e2e/tests/keyboard-authoring.spec.ts`
hold the Door tool case and the pointer wall run.

## Update (2026-11-19): Escape decides after the key press, not between its listeners

Issue #909 found a fault in the ladder. Under the Wall tool, with a run open from the keyboard, the
first Escape returned to the select tool, spoke nothing, and left the run open. After the tool was
armed again, the next Enter drew a wall that the user did not ask for. The keyboard measurement of
the Dimension tool failed in the same way, and so did the first Escape of the calibration tool after
its first click.

The cause was the moment of the decision. The return to select was queued as a microtask. For a real
key press, a browser runs microtasks between the listeners of the event, so the decision ran before
the tool that cancels had claimed the key. The tool change then removed that tool's listener before
it ran. Tests that send the key from script did not see the fault, because there the microtasks wait
for the whole dispatch. The `chromium` and `webkit` test projects showed the fault. The `firefox`
project did not.

The ladder now guarantees this. Every claim happens inside a listener of the key press. The return to
select runs as a task that the press queues, after every listener ran, in whatever order the
listeners were added. A decision that is still pending when the tool changes is dropped. As a second
guard, a change of tool discards a run or a measurement that the keyboard left open, so none outlives
the tool that started it.

Tests: `editor/plan/use-escape-to-select.test.ts` holds a claim that arrives after a microtask
checkpoint, and a pending decision that a tool change drops.
`editor/plan/use-plan-authoring-run-scope.test.ts` holds the discard. Three journeys in
`e2e/tests/keyboard-authoring.spec.ts` press real keys.

Two paths stay open. A wall run that was drawn with the pointer survives a change of tool (issue
#914). After a placement that selects what it placed, one Escape clears the selection and also
returns to select (issue #915).

## Update (2026-11-19): a change of tool or floor ends every open run

Issue #914 closed the first of the two paths that the section above left open, and it found a second
trigger. A wall run that was drawn with the pointer now ends when the tool changes. Both wall runs
and both halves of the Dimension tool also end when the active floor changes. Before, the next click
or Enter drew a wall or a dimension on the new floor from a point on the old one. The walls already
placed stay, and undo removes them. The keyboard candidate stays where it was, because the floors
share one plan frame.

A change of tool or floor also clears the sentence of the last keyboard step. Before, the live region
kept a line such as "Wall vertex dropped". The first vertex of the next run wrote the same line, the
region did not change, and a screen reader said nothing. Now the region falls back to the selection
or the snap, and the next keyboard step is heard. With nothing selected, that fallback is "Selection
cleared", which is not true either (issue #907). The cleared sentence and the kept candidate are
defaults. The project owner has not decided them.

Decided on 2026-11-20 (#914): the project owner kept both defaults, and no follow-up change is
needed.

Tests: `editor/plan/use-plan-interaction-run-scope.test.ts`,
`editor/plan/use-plan-authoring-run-scope.test.ts`, and `editor/plan/use-dimension-tool.test.ts` hold
the discards, the guard against a discard on a plain re-render, and the cleared sentence. Journeys in
`e2e/tests/journeys/cancel-wall.spec.ts`, `e2e/tests/journeys/switch-floor.spec.ts`, and
`e2e/tests/keyboard-authoring.spec.ts` click and type through the cases.
