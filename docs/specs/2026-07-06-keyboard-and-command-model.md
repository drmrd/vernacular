# Keyboard and command model

Date: 2026-07-06
Status: Proposed target model. Not yet implemented. Companion to the Arris visual design language
(`docs/specs/2026-07-06-arris-visual-design-language.md`, ADR-0154). See ADR-0155.

## Summary

Vernacular is a keyboard-first tool. A fluent user drives it from the keys with a hand rarely
leaving the drawing, so the set of default shortcuts and the rule that resolves them are part of
the product's core, not a preferences afterthought. This spec seats the default command bindings
and states the one precedence rule that decides which command a key fires when several claim it.

The bindings come from the same blind, function-first redesign that produced the Arris language:
each area of the product was designed from a purpose brief alone, and dozens of those designs left
their shortcuts to "the command registry, settled later." This document is that settlement. It
assigns a concrete default to every deferred binding, records the scope each one lives in, and
names the single rule that keeps one physical key from meaning two things at once.

Two honest limits. First, this model has not been mapped against the shipped editor's current
keyboard shortcuts; that reconciliation is follow-on work, and until it lands this document reads
as the destination, not the current state. Second, a handful of the global chords below are
provisional: they use modifier combinations that some browsers or operating systems intercept
before the page sees them, and that audit has not run (issue #498). Every provisional chord also
reaches its command by name through the command deck, so a failed audit downgrades that
shortcut without losing the command.

## 1. Principles

Three rules keep the table honest and buildable.

1. **Scope resolves most apparent collisions.** One physical key can legitimately carry different
   verbs in disjoint scopes: a focused text field, an armed entry buffer, a live gesture, a
   focused panel, a current selection, an armed tool, a focused pane, and the global frame are all
   separate worlds. A letter that is a plan tool key is out of scope inside the 3D pane or a
   focused panel, so it is free to mean something else there. Every reuse in this document is
   scope-disjoint, and the scope is named.

2. **Daily verbs earn an engraved default; rare verbs ride the deck by name.** The command deck
   (the product's searchable command surface) is the home for low-frequency actions. Spending a
   scarce, audit-fragile global chord on a rarely opened panel is the anti-pattern the deck exists
   to prevent, so infrequent surface-opens default to deck-by-name and stay rebindable. Engraved
   defaults are reserved for actions a fluent user hits many times an hour.

3. **Global chords are provisional until the deliverability audit runs.** Some modifier
   combinations never reach the page in some browsers. Every `Ctrl/Cmd+Shift+<key>` default below
   is marked provisional. Because the by-name path reaches each of those
   commands anyway, a failed audit costs the chord and leaves the command reachable.

## 2. The scope-precedence ladder

When more than one binding could fire for a keystroke, the highest live scope wins. This is the
single ordering every binding in this document is consistent with; without it, the per-key
assignments are unfalsifiable.

1. **Focused text or numeric input.** Keystrokes are content. Only keys the field registers act.
2. **Armed, non-empty entry buffer.** The numeric-entry grammar owns every printable key while a
   value is being typed; Tab latches the quantity.
3. **Mid-gesture claims.** A live run or drag owns its gesture keys: snap-toggle letters, the Tab
   candidate cycle, and any gesture-scoped overrides a tool declares while drawing.
4. **Panel focus.** A focused bench panel's registered letters act; plain tool letters are
   suppressed while the panel holds focus.
5. **Selection-scoped claims.** Property jumps and object verbs on the current selection.
6. **Armed-tool claims.** A tool's own scoped letters while it is armed and idle.
7. **Pane focus.** Plan tool letters against 3D camera letters, decided by which pane holds focus,
   never by which pane is merely visible.
8. **Global chords and the frame layer.** Everything not claimed above.

## 3. Reserved anchors

These keys are claimed across the whole product. Every assignment in section 4 works around them.

- **The tool rack.** Select `V`, Wall `W`, Opening `O`, Element `E`, Stair `S`, Furniture `F`,
  Dimension `D`, Underlay `R`, Paint `P`. `Shift+<tool letter>` arms the tool and opens its
  loadout drawer from anywhere; re-pressing an armed variant tool's own key opens its drawer. The
  bare-key press is a plain arm for tools without a loadout.
- **Swaps and panning.** Backtick is the last-tool swap and nothing else. Space is held-pan only.
- **Floors.** Digits `1` to `9` are floor hotkeys when the canvas holds focus and no numeric entry
  is armed. `PageUp` and `PageDown` step floors.
- **Snapping and squaring.** Held `X` suspends all snapping; held `Alt` releases the angle and
  squaring assist so the habit "get me off the square, now" never depends on a letter.
- **Tab and the pointer stack.** `Tab` cycles snap candidates with an empty buffer, latches a
  quantity with an armed buffer, and walks entities otherwise. `Alt+click` cycles the pointer
  stack; `Shift+click` toggles selection membership.
- **Stepping graduated controls.** `[` and `]` step the focused graduated control, or the
  increment ladder when none is focused; `{` and `}` step wall thickness.
- **The escape ladder.** `Esc` cancels the innermost thing and stays armed; a further `Esc`
  reaches neutral Select; `Shift+Esc` is the hard abandon. `Esc` never destroys committed work.
- **Commit and fields.** `Enter` commits in place and `Tab` advances fields; in the 3D pane bare
  `Enter` steps through the selected doorway.
- **Views.** `Alt+1`, `Alt+2`, `Alt+3` seat views.
- **The command deck and platform verbs.** `/` summons the command deck, `Mod+K` aliases it.
  `Cmd/Ctrl+,` is settings, `Cmd/Ctrl+Shift+O` recents, `Cmd/Ctrl+Shift+E` export,
  `Cmd/Ctrl+P` the intercepted export alias, `Cmd/Ctrl+Z` and `Shift+Cmd/Ctrl+Z` undo and redo,
  `Cmd/Ctrl+A` select-all, and `Cmd/Ctrl+S` saves the project and is never borrowed.
- **Help and focus.** `F1` opens the reference, `F2` renames the focused nameable, `?` taps to the
  reference and holds to peek the keymap, `F6` rotates focus regions including the message ledger.
- **Common verbs.** `.` repeats the last command, `G` is the scoped go-to, `;` opens the snap
  bench, `Delete` and `Backspace` remove the selection.
- **Angle, stepping, and underlay.** `A` is the scoped angle verb, `,` and `.` step the loaded
  thing, `U` hides the underlay and `Shift+U` hides all, `Shift+[` and `Shift+]` slam the underlay
  fade to its extremes. Held `Q` is the spring-loaded caliper and `M` the latched measure.
  `Shift+S` opens the scale picker, `Shift+G` and `Shift+B` toggle the grid and the floor-beneath
  ghost cue.

Two families of one letter carry more than one meaning, resolved by scope rather than colliding.
`A` means "act on the angle" and resolves to the free-angle latch in wall drawing and editing,
typed-bearing entry in the stair tool, and the angle-field jump in furniture placement. The
momentary escape stays the held `Alt` in every scope, so what must transfer between tools never
depends on `A`. The `,` and `.` pair means "step the loaded thing," resolving to the armed variant
with a loadout tool active, the addressed band with a finish panel focused, and saved conditions
with the environment scrubber focused; a non-empty entry buffer, where the comma is the coordinate
separator, outranks all of them.

## 4. Default bindings by domain

Each table states where a binding is live. Outside its scope, a key carries its reserved-anchor
meaning from section 3. "Deck-by-name" means the command is reached by typing its name in the
command deck and is rebindable. "Provisional" marks a global chord that depends on the browser
deliverability audit (issue #498).

### Shell, project, and files

| Command                             | Default binding                                                                               | Scope                              | Notes                                                                                                                                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create project                      | `Cmd/Ctrl+N` in an installed standalone window only; button and deck-by-name in a browser tab | Global                             | In a browser tab, `Cmd/Ctrl+N` opens a browser window and never reaches the page, and a bare `N` filters the list on the project-home screen. The button and the deck are the guaranteed paths. |
| Jump to the Project panel           | deck-by-name (no engraved default)                                                            | Global                             | Low frequency; the deck reaches it. It focuses the name field on an empty project and the header otherwise.                                                                                     |
| Open or close the Custody panel     | focus the custody stamp in the status-bar tab order, then `Enter` or `Space`; deck-by-name    | Global                             | The stamp is already focusable, so no dedicated chord.                                                                                                                                          |
| Act on the Standing Condition strip | the strip's primary action sits in the tab order; deck-by-name                                | Only while a condition strip shows | Tab-reachable by design.                                                                                                                                                                        |
| Focus-mode toggle (hide chrome)     | `Ctrl/Cmd+Shift+.` (provisional)                                                              | Global                             | Kept off the last-tool swap; a declutter toggle worth an engraved chord.                                                                                                                        |
| Precision settings                  | `Cmd/Ctrl+,` (settings) deep-linked to the precision pane; deck-by-name                       | Global                             | Not a new chord; the settings sheet opened to its precision section.                                                                                                                            |
| Library panel toggle                | `Ctrl/Cmd+Shift+L` (provisional)                                                              | Global                             | Kept off bare `L`, which carries the live-length layer in the plan with nothing selected. Frequent during furnishing, so engraved.                                                              |
| Focus the messages region           | `F6` region cycle lands on it; deck-by-name for a direct jump                                 | Global                             | The message ledger is one region in the rotation.                                                                                                                                               |
| Nth-recent quick-open               | inside the raised recents list (`Cmd/Ctrl+Shift+O`), press the entry's digit                  | Recents-list focus                 | `Cmd/Ctrl+1..9` is browser-reserved, so the digit is list-scoped.                                                                                                                               |

### Layers, scopes, and floors

| Command                               | Default binding                                                                 | Scope                          | Notes                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Swap to previous scope                | `Ctrl/Cmd+Shift+\` (provisional)                                                | Global                         | Kept off the last-tool swap; frequent in the nudge-check-nudge loop, so engraved. Restores each scope's dormant selection. |
| Toggle a scope's visibility           | `H` on a focused scope segment; `Shift+click` the segment                       | Scope-selector cluster focus   | Cluster focus suppresses tool letters, so `H` is free.                                                                     |
| Solo a scope                          | `S` on a focused scope segment; `Alt+click` the segment                         | Scope-selector cluster focus   | Stair's `S` is out of scope in the cluster.                                                                                |
| Round-trip to the last floor          | `Shift+`backtick                                                                | Global (canvas)                | Backtick swaps tools; `Shift+`backtick swaps floors. Not browser-reserved.                                                 |
| Toggle floor-below reference          | `Shift+PageDown`                                                                | Global (canvas)                | `PageDown` steps a floor; `Shift+PageDown` shows the one below as reference.                                               |
| Toggle floor-above reference          | `Shift+PageUp`                                                                  | Global (canvas)                | Symmetric with the below toggle; both are plain on and off, not cycles.                                                    |
| Add floor                             | ledger action; `Ctrl/Cmd+Shift+=` (provisional), inserts above the active floor | Global                         | Kept off the browser-reserved `Ctrl+Shift+N`; the `=` key carries the plus sign, so the chord reads as "add."              |
| Duplicate floor                       | ledger menu; deck-by-name                                                       | Global                         | Kept off the browser-reserved `Ctrl+D`. Floor-scoped and infrequent, distinct from the object Duplicate.                   |
| Global above-cut and cut-height nudge | `Alt+PageUp` / `Alt+PageDown`                                                   | Interior pane up and Reveal on | Off the divider-rail nudge; writes the single cut value, no panel focus needed.                                            |

### Drawing, snapping, and precision entry

| Command                          | Default binding                                        | Scope                                                             | Notes                                                                                                                      |
| -------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Variant step (previous, next)    | `,` / `.`                                              | A loadout-carrying tool armed, canvas focus                       | Off the bare brackets. For Paint this steps the charge through the working palette.                                        |
| Snap-axis signed offset          | an `o` prefix in the entry buffer (for example `o+3"`) | Armed entry buffer with a snap target caught                      | A bare signed value is always a relative length, so the offset takes a distinct `o` token rather than a bare sign.         |
| Face-drag growth-reference cycle | `R` during a face drag                                 | Live wall-face drag                                               | Tool letters yield mid-gesture, so `R` (Underlay) is free during the drag.                                                 |
| Type the scale                   | `Shift+S` (the scale picker)                           | Global (canvas)                                                   | Not a new chord; opens the scale field. Accepts named or ratio forms, never a magnification.                               |
| Type a number                    | any unhandled digit begins entry                       | Canvas focus, no armed numeric context, digit not a floor context | Digits stay floor hotkeys when a floor context holds; a live buffer is itself a numeric context, so the two never overlap. |

### Selection, inspector, and transforms

| Command                     | Default binding                                              | Scope                                  | Notes                                                                                                     |
| --------------------------- | ------------------------------------------------------------ | -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Duplicate (objects)         | `Ctrl/Cmd+Shift+D` (provisional)                             | Selection                              | Off the browser-reserved `Cmd/Ctrl+D`.                                                                    |
| Mirror                      | `Y`                                                          | Furniture selection or armed placement | A free non-tool letter; flips across the local axis, keeping the back edge honest.                        |
| Re-home an opening          | `G`, then aim; or a modifier-drag                            | Opening selected                       | A selection-scoped relocate outranks the global go-to. Off `M` (the measure family).                      |
| Handle and reshape mode     | `H`                                                          | Non-opening selection                  | On a selected opening `H` flips the hinge; on other kinds `H` is handle mode. Disjoint, so both keep `H`. |
| Reverse pointer pick-cycle  | `Shift+Alt+click`                                            | Pointer at rest over a stack           | Forward is `Alt+click`; this is its reverse.                                                              |
| At-rest keyboard stack step | `Alt+Down` (deeper) / `Alt+Up` (shallower)                   | Hover or selection, canvas at rest     | `Alt+Left` and `Alt+Right` are browser history navigation; `Alt+Up` and `Alt+Down` are free.              |
| Select similar              | deck-by-name; rebindable                                     | Selection                              | `Cmd/Ctrl+Shift+A` is reserved, so no near-neighbor of `Cmd/Ctrl+A` is safe; the deck carries it.         |
| Restore last selection      | deck-by-name; rebindable                                     | Global                                 | Low frequency; no scarce chord spent.                                                                     |
| Nudge-run boundary          | closes on focus change, selection change, or explicit commit | Any nudge run                          | A rule, not a binding. Never a wall-clock timer.                                                          |

### Openings, rooms, and dimensions

| Command                       | Default binding                | Scope                            | Notes                                                                                                          |
| ----------------------------- | ------------------------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Swing-state jumps             | `Shift+1` to `Shift+4`         | Opening selected                 | Bare digits are floor hotkeys, so the swing jumps carry Shift; `H` and `F` stay the read-and-flip toggles.     |
| Define a custom room outline  | inspector button; deck-by-name | Global                           | Off `O` (the Opening tool). An occasional job, so no engraved chord.                                           |
| Chain the next dimension span | `Tab` from a seated dimension  | A dimension seated, empty buffer | `Tab` cycles snap candidates only with an empty buffer, so chaining fires from a seated span, never mid-entry. |

### Paint and finish

| Command                                | Default binding                                                             | Scope                             | Notes                                                                                                                   |
| -------------------------------------- | --------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Swap the charge to previous            | `S`                                                                         | Paint armed                       | Off the held-`X` suspend-all; the Paint-armed scope suppresses the Stair letter, so `S` reads as swap.                  |
| Focus the lower or upper band          | `,` / `.`                                                                   | Paint armed or Bands editor focus | Off the brackets; the same step pair the finish panel uses for its addressed band.                                      |
| Focus the finish panel from the canvas | `Ctrl/Cmd+Shift+F` (provisional); or `F` (open picker) while paint is armed | Global; paint-armed               | Off bare `F` (Furniture). Within paint, `F` opens the picker.                                                           |
| Load the charge from a palette slot    | `1` to `8`                                                                  | Paint armed                       | Bare digits revert to floor hotkeys with canvas focus and no armed paint tool. The eight slots are the working palette. |

### The Interior pane: navigation, reveal, environment, and 3D selection

Every binding here requires the Interior (3D) pane to hold focus, never mere visibility, which is
why plan tool letters are free to be reused inside it.

| Command                                  | Default binding                                                              | Scope                                     | Notes                                                                                                                                                                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focus the Interior pane                  | `F6` region cycle; `Alt+3` seats and focuses the pane                        | Global                                    | Seating the 3D view focuses it; a split-view focus without reseat rides the region cycle.                                                                                                                             |
| Save a viewpoint                         | `V`; `Shift+digit` stamps to a numbered slot, `Shift+digit` alone recalls    | Interior-pane focus                       | Bare `V` is plan Select, suppressed in the pane, so here `V` is viewpoint.                                                                                                                                            |
| Collapse the pane rails                  | `\`                                                                          | Interior-pane focus                       | The global backslash claimants are plan-scoped; inside the pane backslash is free. Persists across sessions.                                                                                                          |
| Enter walk mode                          | `Shift+Enter`; or the Walk viewpoint slot                                    | Interior-pane focus                       | Bare `Enter` steps through the selected doorway; `Shift+Enter` enters the walk.                                                                                                                                       |
| Reveal mode: Auto, Dollhouse, X-ray      | `A` / `D` / `X`                                                              | Interior-pane focus                       | Plan tool letters (`D`) and suspend-all (`X`) are out of scope in the pane.                                                                                                                                           |
| Reveal mode: Solid, with peek            | `Q` taps to Solid and back, holds to peek solid                              | Interior-pane focus                       | Off the last-tool swap and off `S` (a saved elevation); the plan caliper `Q` is free in the pane.                                                                                                                     |
| Cut-height named-stop jump               | `Alt+Up` / `Alt+Down`                                                        | Cut stop or cut field focused (Dollhouse) | Jumps sill to head, course by course. Arrows alone step one detent, Shift ten.                                                                                                                                        |
| Reveal-strength detent jump              | `Alt+Up` / `Alt+Down`                                                        | Reveal-strength slider focused            | Jumps to the next named detent; disjoint from the cut jump by which control holds focus.                                                                                                                              |
| Focus the solar scrubber                 | tap `L`                                                                      | Interior-pane focus                       | The scrubber is also in the tab order; `L` is the accelerator.                                                                                                                                                        |
| Light modifier (hold, act on light)      | hold `L`                                                                     | Interior-pane focus                       | Deliberately not `Alt`. Held `L` and drag pulls the sun; and arrows nudge; and brackets jump solar events; and `1` or `2` recall the A and B register; and `,` or `.` flick saved conditions. Tap focuses, hold acts. |
| Toggle editing and realistic render      | `T`                                                                          | Interior-pane focus                       | `T` is free in the pane.                                                                                                                                                                                              |
| Toggle the neutral color check           | `C`                                                                          | Interior-pane focus                       | `C` (a plan toggle) is out of scope in the pane.                                                                                                                                                                      |
| Save the current lighting condition      | `Shift+S`; deck-by-name                                                      | Interior-pane focus                       | Distinct from `Cmd/Ctrl+S` (project save) and from the A and B register stash.                                                                                                                                        |
| Toggle the Environment panel             | deck-by-name; panel rack                                                     | Global                                    | Low-frequency surface open; no engraved chord.                                                                                                                                                                        |
| Arm the move collar (exact entry)        | `G`                                                                          | Interior-pane selection                   | Off `M` (the measure family, which must never move furniture). A selection-scoped relocate, disjoint from the opening re-home and the global go-to.                                                                   |
| Rotate and raise instruments             | `R` (quarter-turn, `Shift+R` counter) / `H` (height, elevation objects only) | Interior-pane selection                   | One rotation grammar across the 2D and 3D seam.                                                                                                                                                                       |
| Front-to-back depth step                 | `Alt+Down` / `Alt+Up`; `Alt+click` pointer                                   | Interior-pane selection                   | The keyboard twin of the pointer cycle; disjoint from the cut and strength jumps by whether a control or an object holds focus.                                                                                       |
| Jump to the plan from a plan-only object | `P`                                                                          | Interior-pane, plan-only object selected  | `P` (Paint) is out of scope in the pane; here it opens the plan with that object selected.                                                                                                                            |

### Underlay, help, era, and site

| Command                                                | Default binding                                              | Scope                     | Notes                                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------ | ------------------------- | -------------------------------------------------------------------------------------------------- |
| Momentary underlay dimmer                              | hold `U` (tap `U` hides, hold dims)                          | Underlay present          | Off held `F` (Furniture). Tap-hide plus hold-dim mirrors the peek idiom on the underlay's own key. |
| Archive the underlay                                   | deck-by-name; the Archive panel action                       | Global                    | Archiving also drops the underlay from the snap set. Restore is the paired action.                 |
| Jump to a term's definition                            | `Ctrl/Cmd+Shift+/` (provisional); click the dotted underline | A term focused or hovered | Off `F2` (rename). The accessibility path to definitions earns a chord; the deck also carries it.  |
| Cue toggles: dimension annotations, frame rules, proof | `Shift+M` / `Shift+K` / `Shift+J`                            | Global (canvas)           | Non-tool letters, chosen so the arm-and-open reservation on the tool letters is untouched.         |
| Period section or panel                                | deck-by-name; the era section in the inspector               | Global                    | Off `Shift+E` (an Element loadout). A named fallback family is available if a chord is wanted.     |
| Era advisory: accept, keep                             | `E` / `K` while an advisory window is armed                  | Armed advisory            | Scoped strictly to the advisory; bare `E` is the Element tool otherwise.                           |
| Focus the Site panel                                   | deck-by-name; the Site section                               | Global                    | Low-frequency metadata surface; no engraved chord.                                                 |

## 5. What stays provisional, and why

Two kinds of binding are recorded as unsettled rather than forced.

1. **Create project inside a browser tab.** `Cmd/Ctrl+N` reaches the browser, not the page, and a
   bare `N` filters the list on the project-home screen. The button and deck-by-name are the
   guaranteed paths. A workspace chord for New waits on the deliverability audit finding a
   browser-safe combination, and `Cmd/Ctrl+N` is honored in an installed standalone window where
   the app owns the chord.

2. **Every `Ctrl/Cmd+Shift+<key>` default.** These are provisional on the per-browser, per-platform
   deliverability audit (issue #498), which has not run. Each command is reachable by
   deck-by-name regardless, so a chord that fails the audit falls back to its by-name path.

Everything else in the sweep has a concrete default. Read with the reserved anchors and the scope
ladder, this table is complete enough to stand as the seed the command registry needs.

## Open questions and validation

This model is a target, not the shipped bindings. The items below gate its adoption.

- **Scoped mid-gesture Tab under assistive technology (issue #497).** The model reuses `Tab`
  mid-gesture for the snap-candidate cycle, the quantity latch, and entity walking. Screen readers
  capture `Tab` for their own navigation, so this behavior needs a spike to confirm it is reachable
  and announced, or a designed fallback. This is a build blocker.
- **Browser and platform chord deliverability (issue #498).** Every provisional chord above waits
  on this audit. It is cheap, and it decides which chords survive as engraved defaults and which
  fall back to the command deck.
- **Reconciliation with the shipped editor.** The current app's keyboard shortcuts have not been
  mapped against this model. That comparison, and a migration plan for any binding that moves, is
  follow-on work.
- **The rebinding surface.** The model assumes a single place a user remaps keys. Whether that is
  the command deck's own in-place capture, a dedicated settings surface, or both, is not settled
  here, and neither is exporting or syncing a rebind set across machines.
- **Dependency on the language target.** This model is the interaction grammar for the Arris
  language, which is itself a proposed target (ADR-0154). Both are direction, not current state,
  until the migration lands.
- **The numeric-entry contract.** The entry grammar in the ladder's second level assumes a settled
  numeric-storage model; the choice between an exact-rational and an SI-derived representation is an
  open decision (issue #496) that the entry grammar depends on.

## References

- ADR-0155 (adopt the keyboard and command model as a target; seat default bindings)
- Companion language: `docs/specs/2026-07-06-arris-visual-design-language.md`, ADR-0154
- Governing design specification: `docs/specs/2026-06-01-vernacular-design.md`
- DOM overlay and accessibility: `docs/specs/2026-06-09-dom-overlay-and-accessibility.md`
- Open spikes and decisions this model depends on: issue #497 (scoped Tab under screen readers),
  issue #498 (chord deliverability audit), issue #496 (numeric storage model)
