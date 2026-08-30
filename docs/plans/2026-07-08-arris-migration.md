# Arris migration plan

> **For agentic workers:** This is a phased migration _program_ plan, not a single-feature task
> plan. Phase 1 is feasibility spikes: throwaway prototypes whose deliverable is a measurement and a
> go or no-go, not shipped code, so they run outside the red-green-blue cycle. Every build slice in
> Phases 2 through 4 runs its own red-green-blue TDD cycle through role-separated subagents from the
> MAIN thread (`/test-first` commits `test:`, `/implement` commits `feat:`, `/clean-code-review`
> then `/refactor` commits `refactor:` or an empty marker), closes each GREEN with a BLUE before the
> next `test:`, and runs `node scripts/rgb-audit/rgb-audit.mjs --range origin/main..HEAD` before
> every push. An architectural slice earns its own detailed slice plan and ADR before it is built.
> Steps use checkbox (`- [ ]`) syntax.

**Goal:** Move the shipped editor from Draughtsman's Restraint (ADR-0069) to Arris (ADR-0154) without
ever leaving the running app visibly half-migrated, by proving the paper-only bets first, building
the foundations and components behind a parallel theme, and flipping the live default only once a
coherent whole is ready.

**Architecture:** Four phases plus one parallel track. Phase 1 prototypes and measures the five
signature behaviors the Arris spec asserts on paper, each with a pass bar that graduates it to a
build slice. Phase 2 lays the Arris token set, self-hosted faces, and retargeted contrast tests
behind a preview flag, so the live default stays Draughtsman's Restraint. Phase 3 migrates component
families against the Arris theme in Storybook, proven before any is wired into the shell. Phase 4
flips the default in one coherent cutover and records the supersession. Iconography is its own track
feeding Phase 3.

**Tech stack:** TypeScript, React, CSS custom properties (the design-system token layer), Vitest,
Playwright (Storybook visual tier and scene-webgl tier), pnpm. Self-hosted OFL faces replace the web
font service. Layered architecture: `core/` (pure domain) / `storage/` / `engine/` (Three.js) /
`bridge/` (R3F glue) / `editor/` (the design system lives here) / `app/`.

## Global constraints

Every task inherits these. Values are copied from the Arris spec, ADR-0154, and the repo rules.

- **The app is never visibly half-migrated (ADR-0154).** Phases 2 through 4 build behind a parallel
  theme. "One live component at a time" in the shipped shell is not ADR-legal. The live default stays
  Draughtsman's Restraint until the Phase 4 cutover flips it.
- **The live default is byte-for-byte unchanged while the preview flag is off.** Arris tokens are
  scoped under a design-language attribute, never at `:root`; nothing at `:root` moves until cutover.
- Conventional Commits; no `Co-Authored-By` and no `Claude-Session` (or any AI-session) trailer.
- No em-dash in newly composed prose. Human-read docs (specs, ADRs, this plan, READMEs) pass the
  `humanizer` skill before they land.
- 30-day dependency cooldown (`.npmrc` `minimum-release-age=43200`); exact version pins, no ranges;
  committed lockfile. Self-hosted faces are vendored assets, not npm packages, so they sidestep the
  cooldown; any tooling dependency (a subsetter) obeys it.
- Layer boundaries hold: `core/` imports neither React nor Three.js; `engine/` is the only Three.js
  importer; all model mutations flow through `dispatch(command)`. The design system is `editor/`;
  the 2D canvas palette is threaded through the `PlanPalette` resolver, not read from CSS by the
  canvas.
- Branch names are descriptive (`feat/<short>`, `docs/<short>`); no milestone codes; no third-party
  product or font-service names in persisted text (name the faces, not the service).
- Contrast floors are hard (Arris spec section 5): body text 7:1 both appearances, stamped labels and
  secondary text 4.5:1, focus indicators and accent and instrument marks 3:1, the cased mark 3:1 over
  whatever ground it crosses. Plan linework: primary 4.5:1, receded snappable 3:1, reference ghost
  exempt.
- The three faces are Besley, Atkinson Hyperlegible Next, and B612 Mono, all SIL OFL, self-hosted with
  their license notices.
- Never push to `main`; PRs gate on `ci-complete`; merge with `gh pr merge --merge`. Window commit
  dates off employer hours (08:30 to 18:30 local) before the first push.

## Source of truth

The Arris spec `docs/specs/2026-07-06-arris-visual-design-language.md` is authoritative for every
token value, ratio, and behavior. This plan points at spec sections rather than re-transcribing their
tables, so the tables never drift from a copy here. ADR-0154 records the decision and its constraints.
The local design-review corpus is not a source: cite the spec, never the corpus.

---

## Phase map

| Phase                        | Delivers                                                                 | Gate to exit                                                                              | Depends on                         |
| ---------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ---------------------------------- |
| 1. Feasibility spikes        | Five measured prototypes, each with a go or no-go                        | Every spike passes its bar, or its behavior is re-scoped or revised via an ADR            | none                               |
| 2. Foundations behind a flag | Parallel-theme scaffold, Arris tokens, self-hosted faces, contrast tests | Arris theme selectable by flag; live default unchanged; Arris contrast tests green        | Phase 1 (which behaviors graduate) |
| 3. Component families        | Each family migrated against the Arris theme in Storybook                | Every family renders under Arris in Storybook with tests and baselines green              | Phase 2, Iconography               |
| 4. Coherent cutover          | Live default flipped; Google Fonts and Phosphor removed; ADRs flipped    | Whole editor renders Arris; no surface still Draughtsman's Restraint; full chain green    | all of Phase 3                     |
| Iconography (parallel track) | Custom 1.5px stroke icon set, period artifacts drawn correctly           | Icon set renders as a family with baselines; ready before icon-consuming Phase-3 families | runs alongside 1 and 2             |

The critical path is Phase 1 spikes graduate behaviors, then the Phase 2 parallel-theme scaffold
(slice 2.1) underpins everything visual, then families in Phase 3, then the Phase 4 cutover. The
iconography track runs alongside Phases 1 and 2 and must land the icons a family consumes before that
family migrates.

---

## Phase 1: Feasibility spikes

The Arris spec's signature behaviors were designed on paper. Each spike below builds the smallest
prototype that answers whether the behavior holds against the real engine, measures it, and records a
go or no-go. A spike is throwaway: its output is a number and a decision, not a shipped feature, so it
runs outside the red-green-blue cycle. Build spikes as scratch Storybook stories or a scratch harness
route under a `spike/` label; do not wire them into the shell and do not keep them after the decision.

**When a bar fails, the behavior does not silently proceed.** It is either re-scoped to what the
engine can hold or the spec's open question is revised. Because revising the spec needs an ADR
(rules), a failed spike opens a spike-revision ADR at the next free number (ADR-0156 is long since taken; re-verify against origin/main before landing) recording the
measured limit and the revised target.

Each spike names the Phase 2 or Phase 3 build slice it graduates.

### Spike 1: Detent feel and input latency

- **Prototype:** the dimension field, one slider, and the angle dial, each carrying graduation ticks
  and detents, in a scratch story.
- **Measure:** input-to-first-visual-acknowledgement latency, and that the seat flash reads and the
  value settles on a graduation. Target hardware is the dev Mac and one mid-tier machine.
- **Pass bar (spec section 8):** every control acknowledges input within 100ms at the 95th percentile;
  the seat flash lands at 50ms on the mark seated into; standard transitions hold 90ms and never
  exceed 140ms on `cubic-bezier(0.2, 0, 0, 1)`; the reduced-motion form is a static highlight.
- **Graduates:** the dimension-input, slider, and angle-dial build slices (Phase 3, fields and
  instruments).
- **Fail path:** re-scope the acknowledgement to a cheaper feedback that still lands under 100ms, or
  revise the latency target in the spike-revision ADR.

### Spike 2: Live-geometry performance

- **Prototype:** live length and angle readouts updating every frame during a wall drag on a large
  plan (state a concrete size at the upper end of the floor-plan corpus, in the hundreds of walls).
- **Measure:** frame time during the drag with the readout live.
- **Pass bar (spec sections 10 and 11):** the live readout updates each frame without dropping the
  frame budget (60fps, 16.7ms per frame) on the target hardware.
- **Graduates:** the status-rail live-readout slice and the dimension-field live scrub (Phase 3).
- **Fail path:** throttle or batch the readout to a stated cadence, or revise the budget expectation in
  the spike-revision ADR.

### Spike 3: The luminance-adaptive cased mark

- **Prototype:** the cased mark (an accent or instrument mark with a thin luminance-adaptive keyline in
  the opposing tone) drawn over a worst-case sample of grounds: a spread of user finish colors, a raster
  underlay, and lit 3D surfaces at varied luminance. Include the cursor badge, a snap glyph, the walk
  reticle, and a projected 3D mark.
- **Measure:** contrast of the mark against the actual local ground it crosses, both light and dark
  appearances.
- **Pass bar (spec sections 5 and 8):** the cased mark measures at least 3:1 against the real ground
  everywhere in the sample, in both appearances, as one token rather than a per-surface invention.
- **Graduates:** the cased-mark token and its consumers (cursor badge, snap glyphs, walk reticle,
  projected 3D marks) in Phase 3.
- **Fail path:** widen the keyline rule or add a second casing tone (an ADR, since it extends the
  spec's single-token cased mark), or record a documented ground exclusion in the spike-revision ADR.

### Spike 4: Assistive-technology reach

- **Prototype:** the canvas keyboard-focus model, Layout Blue L-shaped corner brackets on canvas
  entities with the standard focus ring on the DOM proxy behind the canvas, plus scoped focus and a
  roving proxy. This ties to the keyboard and command model (ADR-0155) and issue #497; the DOM-overlay
  proxy already exists (edit-layer scoping, issue #336 lineage).
- **Measure:** reach and announcement under a real screen reader on two platforms (VoiceOver on the dev
  Mac and one Windows screen reader).
- **Pass bar (spec section 8):** every canvas entity is reachable through the roving DOM proxy, is
  announced with its type and name, and focus scoping honors the active edit layer; keyboard reach
  matches the ADR-0155 model.
- **Graduates:** the canvas focus-bracket and DOM-proxy build slice, and the keyboard-model work
  tracked in #497.
- **Fail path:** revise the proxy design and coordinate the change with the ADR-0155 track.

### Spike 5: Color fidelity against a physical reference

- **Prototype:** a rendered color specimen (a paint chip and a finish swatch in the editor render path)
  alongside a physical reference sample.
- **Measure:** perceptual color difference (deltaE 2000) between the rendered specimen and the physical
  reference under three cases: neutral paint judgment, dark poche (dark appearance), and lit-board glare
  (an underlay lit board).
- **Pass bar (spec section 5 and the spec's Color-fidelity open question):** the rendered specimen
  matches the physical reference within a stated tolerance in all three cases. Proposed starting bar
  deltaE 2000 at most 3; confirm the exact threshold with the owner before the spike runs.
- **Graduates:** the paint-chip and finish-swatch rendering slices and the dark-appearance canvas.
- **Fail path:** calibrate the render path, or record the fidelity limit and the case it applies to in
  the spike-revision ADR. A material change to the color pipeline earns its own ADR.

---

## Phase 2: Foundations behind a parallel theme

Everything here is real build work under the red-green-blue cycle, and all of it is gated behind the
preview flag so the live default stays Draughtsman's Restraint. Order matters: the scaffold (2.1)
comes first because every later slice attaches to it.

### Slice 2.1: The parallel-theme scaffold and preview flag

**Files:** `editor/design-system/theme-provider.tsx` and its test; a new design-language module beside
`theme.ts`; `app/app.tsx` (read the flag, the URL-param reader already lives at `app/app.tsx:61`).

**Design:** the theme provider today sets `data-theme` (light or dark) on its wrapper. Add a second,
independent axis, the design language (`draughtsmans-restraint` the default, `arris` the target),
carried as a `data-design-language` attribute on the same wrapper. A preview flag selects Arris: a URL
query param (propose `?theme-preview=arris`, confirm the key with the owner) read through the existing
param reader, gated so production defaults to Draughtsman's Restraint. Arris token declarations (2.2)
are scoped under `[data-design-language='arris']`, so with the flag off nothing at `:root` changes and
the live app is byte-identical.

**Gate:** with no flag the provider resolves `draughtsmans-restraint`; with the flag it resolves
`arris`; the live default render is unchanged. A guard test asserts the flag defaults off in
production.

### Slice 2.2: The Arris token set

**Files:** new `editor/design-system/tokens-arris.css` (raw values, scoped under
`[data-design-language='arris']` and its dark variant); new `editor/design-system/tokens-arris.ts`
(the semantic token map, mirroring `tokens.ts`); a token test.

**Design:** port the Arris spec verbatim into scoped declarations. The live `tokens.css` is not
touched.

- **Palette (spec section 5):** Rag Vellum `#F7F6F2` (light canvas), Beech `#DFD9CE` (light chrome),
  Japanned Iron `#23272B` (light ink and dark chrome), Blued Steel `#16202C` (dark canvas), Layout Blue
  `#2E55C4` lifting to `#7E98E6` in dark (accent, lines and glyphs only, never a surface fill), Red Lead
  `#A6402F` lifting to `#CE7B63` in dark (destructive and data-loss only), bone-white text `#E9E7E1` in
  dark. The lit-board exception reuses the Rag Vellum token as the sheet under a dark bench when an
  underlay is loaded; mint no new color for it.
- **Ink ramp (spec section 5 table):** eight roles by name with the published per-appearance opacity
  and floor. The ramp is the contract; port every row.
- **Density and spacing (spec section 6):** base 4px; control height 28px; compact and list rows 24px;
  panel padding 12px; gutters 8px; docked panels 280px; the single 44px hero band (solar scrubber only).
- **Shape (spec section 7):** 2px radius on interactive controls; panels and the status bar square;
  borders 1px at 25% ink resting, 1.5px active; the input-field recess (top border one step darker than
  the sides); two elevation tiers (the bench dead flat, raised objects `0 2px 8px` at 25% black plus a
  1px border); the 1.5% chrome grain, never on canvas or controls or text.
- **Motion (spec section 8):** 90ms standard, 140ms maximum, easing `cubic-bezier(0.2, 0, 0, 1)`;
  reduced motion zeroes durations and makes detents static.
- **Type scale (spec section 4):** 11, 12, 13, 15, 20, 22, 28; line height 1.35 in panels, 1.5 in prose;
  no weight below 400; no 18px display size.

**Gate:** the Arris token map exposes every role a component consumes; a token test asserts the scoped
declarations exist and resolve, mirroring `tokens.test.ts` for the live set.

### Slice 2.3: Self-hosted faces

**Files:** a vendored fonts directory under `editor/design-system/` (or `public/`, match the asset
convention) holding subset Besley, Atkinson Hyperlegible Next, and B612 Mono with their OFL notices;
`@font-face` declarations loaded with the Arris theme; the Arris token font-family vars point at them.

**Design:** self-host the three OFL faces and reference them from the Arris font-family tokens (display
Besley at 20px and up weights 500 and 600; interface Atkinson Hyperlegible Next weights 400, 500, 600;
data B612 Mono weights 400 and 700). The Google Fonts path in `index.html` stays for the live
Draughtsman's Restraint default and is removed at cutover (Phase 4), not here. Subset to the used
weights and ranges; commit the license notices beside the files.

**Gate:** the Arris theme renders in the three faces with no network font request; the fractions
doctrine (spec section 4, full-size hyphen-and-solidus, never a stacked glyph) renders correctly in a
story.

### Slice 2.4: Retargeted contrast tests

**Files:** new `editor/design-system/palette-contrast-arris.test.ts`; the existing
`palette-contrast.test.ts` is left green on the live tokens.

**Design:** the current test checks the Draughtsman's Restraint floors (4.5:1 body, 3:1 UI) against
`tokens.css`. Write a parallel test that parses `tokens-arris.css` for both appearances and asserts the
Arris ink-ramp floors from spec section 5: body and load-bearing values 7:1, stamped labels and
secondary text 4.5:1, focus indicators and accent and instrument marks 3:1. Assert each ink-ramp role
against its true ground (iron over Beech or Vellum in light, bone over Iron or Blued Steel in dark), not
against a single surface, because the ramp's per-appearance values differ while the ratio target is
identical.

**Gate:** every Arris ink-ramp role meets its published floor over its true ground in both appearances.

---

## Phase 3: Component families in Storybook

Each family migrates against the Arris theme, is proven in Storybook with component tests and visual
baselines, and is wired into the live shell only under the Arris theme, never as a lone live component
in the Draughtsman's Restraint default. The family list is the current `editor/design-system/`
inventory crossed with the spec's component exemplars (section 10); the exact per-component code is
authored slice by slice against the Phase 2 tokens and the behaviors Phase 1 graduated, each its own
red-green-blue cycle with its own tests. It is not pre-written here because it depends on those inputs.

**Families, each a build slice:**

- **Buttons** (`button.tsx`, `icon-button.tsx`): 28px tall, 2px radius, 12px horizontal padding; light
  Japanned Iron fill with Rag Vellum label, dark inverts to bone fill with iron label; the accent never
  fills a button (spec section 10).
- **Fields and the dimension input** (`field.tsx`, new dimension-input component): the flagship. Recessed
  field, value right-aligned in B612 Mono, a graduation-tick row whose pitch reflects the current nudge
  increment, arrows step one tick with a seat flash and Shift steps ten, parse of `3' 6-1/2"` and `42.5`
  and `108cm` with the parsed value echoed at the 85% emphasis tier, `varies` at full ink for a divergent
  multi-selection, invalid entry gets a Red Lead underline and keeps the text, and a 24px inspector
  variant. Consumes Spike 1 and Spike 2.
- **Toggle and segmented** (`segmented.tsx`, a new toggle): square, 2px radius, full-impression invert
  (active fills with ink, the glyph reverses to ground), never a pill, never a sliding thumb (spec
  sections 8 and 10).
- **Panels and structure** (`app-frame.tsx`, `panel-slot.tsx`, `section-label.tsx`, `stack.tsx`, a panel
  header): the bench doctrine, dead flat with kerf lines at 20% ink, stamped headers (interface face 600,
  11px, uppercase, tracked, 80% ink), docked panels 280px, sections separated by a 1px kerf line (spec
  sections 6, 7, 10).
- **Status rail** (`status.tsx`): the 24px bar in B612 Mono at 11.5px with one owner and a slot registry
  (cursor position, live length and angle, active snap target, current increment, custody). Consumes
  Spike 2 (spec section 10).
- **Raised objects** (`menu-surface.css`, `notifications/`): menus and dialogs are picked-up things that
  cast the single raised shadow and leave on Escape; notifications obey "nothing floats over the canvas
  uninvited" and the custody doctrine (spec sections 7, 8, 12, 14).
- **Tool selector rack** (lives in `editor/tools/`, consumes the design system): 32px slots holding 20px
  icons, the active slot a full impression with the 2px Layout Blue scribe line down its left edge, the
  shortcut letter engraved at the engraved-mark tier (spec section 10). Consumes the Iconography track.
- **The 2D canvas palette** (the `PlanPalette` resolver and its Arris values): plan linework in Japanned
  Iron, selection and handles in Layout Blue, the cased mark over uncontrolled ground, the dark-appearance
  lit-board exception. Consumes Spike 3. This family threads values through `PlanPalette` into `drawPlan`,
  since the canvas cannot read CSS variables directly.

**Gate per family:** the family's stories render under the Arris theme, its component tests are green,
its Storybook visual baselines are refreshed (rendered on CI, not hand-edited), and it obeys its spec
section and the section-14 refusals (no faux material, accent never fills a surface, numbers and plan
geometry never self-animate, nothing floats over the canvas uninvited, no pill, no weight below 400).

---

## Iconography track (parallel)

**Files:** a new Arris icon set under `editor/design-system/` (or an `icons/` module), its stories, and
its visual baselines; the Phosphor dependency stays until cutover.

**Design (spec section 9):** custom stroke icons at 1.5px weight on a 20px grid, butt caps and square
joins so terminals read as machined ends; inside a 20px rule the footprint may drop to 14px with the
stroke weight and terminals held; a second tone at 15% ink may fill void areas. Period referents are
drawn correctly (a six-over-one sash for the double-hung window, stiles and rails in plausible proportion
for the four-panel door); abstract operations get plain geometry; no icon stands alone for a period term,
the label or an immediate tooltip sits beside it.

**Gate:** the icon set renders as a family with its own visual baselines, and the icons a Phase-3 family
consumes (buttons, the tool rack) land before that family migrates. This track runs alongside Phases 1
and 2 and replaces Phosphor, a dependency removed at cutover.

---

## Phase 4: Coherent cutover

The live default flips only when the whole editor renders Arris coherently: every Phase-3 family
migrated and wired, every graduated spike behavior in place, the Arris contrast gates green. The cutover
happens once, as a single coordinated change.

- [ ] **Flip the default.** Invert the preview flag so `arris` is the resolved default and
      `draughtsmans-restraint` is reachable only as a fallback if kept at all. The `:root` set becomes
      Arris; the scoped attribute is no longer needed for the default path.
- [ ] **Remove the Google Fonts path.** Delete the `fonts.googleapis.com` and `fonts.gstatic.com`
      preconnects and the `css2` stylesheet link from `index.html`, and retarget the Google-Fonts
      assertions in `editor/design-system/tokens.test.ts` (currently around lines 162 to 168) to the
      self-hosted faces.
- [ ] **Remove Phosphor.** Drop the icon dependency now that the Arris set is live; update the lockfile.
- [ ] **Reconcile downstream specs.** The editor visual-design-quality pass
      (`docs/specs/2026-06-14-editor-visual-design-quality.md`) and the design-system token contract
      (`docs/specs/2026-06-09-design-system-token-and-theming-contract.md`) assume Draughtsman's Restraint;
      reconcile them to Arris as the cutover lands, each change with its ADR where it is architectural.
- [ ] **Flip the ADRs (spec two-phase model, ADR-0154).** ADR-0069 moves to `superseded` with a dated
      pointer to ADR-0154; ADR-0154 becomes the shipped-current language as well as the target. The Arris
      spec's status header moves from target to shipped. This is a `docs:` change riding the cutover.

**Gate:** the whole editor renders Arris; no surface still shows Draughtsman's Restraint; app, scene, and
story baselines are refreshed on both families where the palette moved; the full chain
`pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` is green, each command's own
exit code checked.

---

## Validation and evidence

- **The ADR-0154 invariant is itself a test.** While the preview flag is off, the live app renders as it
  did before the migration. The Phase 2.1 guard test and the untouched `:root` tokens enforce it; a live
  baseline that moves before cutover means the migration has leaked into the default, which is a
  regression to fix.
- **Contrast** is gated by `palette-contrast-arris.test.ts` (Phase 2.4) for chrome and by the plan-linework
  floors for the canvas family (Phase 3).
- **Component appearance** is gated by Storybook visual baselines, rendered on CI (`refresh-story-baselines.yml`,
  the `run:visual` label); amd64 chromium crashes under qemu locally, so the main thread owns baseline
  refresh. Recurring noise baselines to revert: library-launcher, removecontrol.
- **Canvas appearance** is gated by the scene-webgl baselines (both `-darwin` and `-linux` families) when the
  2D palette or any 3D-adjacent mark moves.
- **Accessibility** is gated by the Spike 4 screen-reader harness and the keyboard-model work (#497, ADR-0155).
- **Behavior latency and performance** carry the Spike 1 and Spike 2 measurements forward as the acceptance
  bar for the fields, instruments, and status-rail slices.

## Open decisions and waiting on the owner

1. **Issue granularity.** Do not file 64 component issues. Stage a small set as `issue-notes/` drafts: one
   Arris-migration epic plus the five feasibility-spike issues. These plus the interaction-validation epic
   (`issue-notes/0014`) overlap #497 and #498; cross-link, do not duplicate. Confirm the breakdown before
   filing.
2. **The preview-flag key** (`?theme-preview=arris` proposed) and whether it also reads a localStorage or
   env gate.
3. **The Spike 5 color tolerance** (deltaE 2000 at most 3 proposed) before that spike runs.
4. **A failed spike revises the spec through a spike-revision ADR at the next free number** (ADR-0156 is taken); confirm that path rather than
   quietly re-scoping.
5. **Landing and merge order.** PR #499 (keyboard and command model) is the base of the Arris branch and
   merges first; then rebase `docs/ratify-arris-visual-language` onto updated main and merge it. Merges to
   `main` need the owner's in-session OK (the self-merge classifier blocks memory-only authorization).

## Self-review against the spec

- The five spikes map one-to-one onto the spec's five feasibility items in Open questions and migration:
  detent feel, live-geometry performance, the luminance-adaptive keyline, assistive-technology reach, and
  color fidelity.
- Each spec section has a home: typography and color and density and shape and motion land in the Phase 2.2
  token set; the contrast floors land in Phase 2.4; the component exemplars (section 10) and the signature
  element (section 11) and custody doctrine (section 12) land as Phase 3 families; iconography (section 9)
  is its own track; the refusals (section 14) are the per-family gate.
- The migration items in the spec (token files, palette-contrast tests, self-hosted faces replacing the web
  font service, iconography replacing the general icon set) each have a slice: 2.2, 2.4, 2.3, and the
  Iconography track, with the font-service and icon-dependency removals sequenced into Phase 4.
- The ADR-0154 constraint that the app is never half-migrated is stated as a global constraint, enforced by
  the scoped tokens and the 2.1 guard test, and released only at the Phase 4 cutover, matching the ADR's
  two-phase supersession.

## References

- `docs/specs/2026-07-06-arris-visual-design-language.md`: the Arris spec this plan migrates toward.
- `docs/knowledge/decisions/ADR-0154-arris-visual-design-language.md`: the decision to adopt Arris and
  migrate incrementally, and the no-half-migrated-app constraint.
- `docs/knowledge/decisions/ADR-0069-visual-design-language-draughtsmans-restraint.md`: the shipped language
  this migration supersedes at cutover.
- `docs/knowledge/decisions/ADR-0155-keyboard-and-command-model.md`: the keyboard model Spike 4 aligns with.
- `editor/design-system/tokens.css`, `tokens.ts`, `palette-contrast.test.ts`, `theme-provider.tsx`: the
  shipped design system the migration parallels and eventually replaces.
- `docs/specs/2026-06-14-editor-visual-design-quality.md` and
  `docs/specs/2026-06-09-design-system-token-and-theming-contract.md`: downstream specs reconciled at cutover.
