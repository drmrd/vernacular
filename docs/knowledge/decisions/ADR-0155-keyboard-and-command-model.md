---
slug: decisions/ADR-0155-keyboard-and-command-model
title: 'ADR-0155: Adopt the keyboard and command model as a target'
type: decision
tags: [keyboard, command-model, shortcuts, interaction-grammar, accessibility, keybindings]
related: [decisions/ADR-0154-arris-visual-design-language]
sourceFiles:
  [
    docs/specs/2026-07-06-keyboard-and-command-model.md,
    docs/specs/2026-07-06-arris-visual-design-language.md,
    docs/specs/2026-06-01-vernacular-design.md,
  ]
status: current
updated: 2026-08-17
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
  own, and both it and calibrate are tools Escape now leaves.
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
