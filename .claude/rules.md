# Project Rules

These rules apply to every contribution to Vernacular, whether by a human or a Claude Code subagent. They are loaded at every conversation start via `CLAUDE.md`.

## Hard invariants

1. **Layer boundaries are non-negotiable.** `core/` does not import React or Three.js. `engine/` is the only layer that imports Three.js. `bridge/` is the only layer that touches both React state and Three.js scene state. Storage browser APIs are only used inside `storage/`. See ADR-0001.

2. **Apache-2.0 license, project-wide.** See ADR-0002 and `LICENSE`. Asset packs declare their own SPDX licenses; the export pipeline refuses incompatible mixes.

3. **All mutations go through `dispatch(command)`** at the bridge boundary. The framework captures the inverse for undo/redo. See ADR-0005.

4. **Asset references are content-addressed.** Every reference is `(scope, contentHash)`. See ADR-0007.

5. **15-day dependency cooldown.** No direct or transitive dependency younger than 15 days. Enforced by `.npmrc` `minimum-release-age=21600`. See ADR-0010.

6. **Knowledge graph stays current.** Significant architectural changes land alongside a `docs/knowledge/` update (new ADR for a new decision, refresh for an evolved one). The CI step "Knowledge index up to date" enforces that `INDEX.md` and `index.json` are in sync.

7. **No Co-Authored-By trailers.** Project setting `includeCoAuthoredBy: false` is the source of truth. Commit messages should never contain `Co-Authored-By: Claude` or similar.

8. **No em-dashes (`—`) in newly composed text.** Rephrase with commas, parentheses, or colons. Downloaded canonical text (Contributor Covenant, license texts) is exempt.

9. **Conventional Commits.** `feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `style`. Mechanical enforcement via `commitlint` lands in Phase 0d; the convention is observed now.

## Workflow rules

10. **Branch per phase.** `feat/phase-<id>-<short-name>` for application work. PRs to `main`. `main` is always releasable.

11. **Author identity.** Locally configured to `Dan Moore <9156191+drmrd@users.noreply.github.com>` per repository.

12. **Red-green-blue TDD for application code.** RED writes a failing test, GREEN writes the minimal implementation, BLUE applies Clean Code review and any refactors. The BLUE phase ends with a `refactor:` commit, even if empty. See ADR-0009.

13. **Independent agents.** The test-author and implementer roles do not share files. The test-author cannot read implementation source; the implementer cannot read test source. See ADR-0011 for the agent system.

14. **PRs require CI green and a `pr-reviewer` verdict** before merging. Maintainer override is documented in `docs/knowledge/exceptions/`.

## Clean Code

Applied at every BLUE phase and once at PR time by the `clean-code-reviewer` agent.

### Naming

Identifiers reveal intent. Avoid abbreviations beyond a small accepted set (`ctx`, `req`, `res`, `id`). Pronounceable. No Hungarian notation.

### Functions

Small. Do one thing. One level of abstraction per function. Three parameters or fewer ideally; an options object when more are needed. No flag arguments.

### Comments

Only for the WHY (constraints, workarounds, non-obvious invariants, surprising-behavior warnings). Never the WHAT. No commented-out code. No journal comments.

### Formatting

Consistent (Prettier-enforced). Vertical proximity: related code grouped. Newspaper style: high-level at top, detail below.

### Objects and data

Classes hide implementation; pure data structures are explicit; do not mix.

### Error handling

Exceptions over error codes. Do not return null; do not pass null. One concern per `try` block. Recoverable errors surface with concrete next actions.

### Boundaries

External dependencies wrapped at clear seams. The `engine/loaders/` directory is the only consumer of Three.js loaders. Storage browser APIs are wrapped inside `storage/`.

### DRY

Real duplication: eliminate. Coincidental similarity: leave. Premature abstraction is worse than repetition.

### Cyclomatic complexity

Flag any function above 10; investigate above 5. ESLint enforces this with a warning at 10 and an error at 15 (Phase 0d).

### SOLID

Single Responsibility, Open-Closed, Liskov, Interface Segregation, Dependency Inversion. The biggest practical hit at Vernacular's stage is SRP plus the dependency direction enforced by the layering.

### FIRST for tests

- Fast: a unit test runs in milliseconds.
- Independent: no shared mutable state.
- Repeatable: deterministic; random seeds logged on property-based tests.
- Self-validating: pass or fail; no manual inspection.
- Timely: written before the implementation it pins down.

### Severity levels

- **must-fix:** the project will be measurably worse without this change.
- **should-fix:** an honest improvement worth doing now. Override is possible with maintainer approval, archived to `docs/knowledge/exceptions/`.
- **consider:** stylistic notes.

## Anti-patterns (codified rejections)

- Tests that mock the system under test instead of exercising it.
- Tests modified to make them pass instead of fixing the implementation.
- Test names that describe methods rather than behaviors.
- Commented-out tests without a tracked issue and an explanatory ADR.
- E2E tests that depend on timing (`sleep(500)`); use explicit wait-for-condition.
- Snapshot baselines committed without diff review.
- Skipping the BLUE phase of the TDD cycle.
- `git push --force` to `main` outside an explicit ADR-justified rewrite scenario.
