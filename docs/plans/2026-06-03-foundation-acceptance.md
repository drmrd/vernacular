# Foundation Acceptance Implementation Plan

> **For agentic workers:** This plan is executed with the project's role-separated red-green-blue cycle (CLAUDE.md, `.claude/rules.md`), not a single-implementer flow. Each behavior task runs RED (test-author writes a failing test and commits it `test:`), GREEN (implementer writes the minimal pass and commits it `feat:`), then BLUE (clean-code-reviewer audits, refactorer applies fixes, a `refactor:` marker commit closes the phase when there is nothing to change). Tasks marked `(infrastructure)` are controller-authored glue (build wiring, CI, hooks, the characterization test, scripts entry points, the roadmap edit, the ADR); they carry no RGB triple, must carry a descriptive `Infrastructure: <reason>` git trailer so `rgb:audit` exempts them, and are reviewed by the clean-code-reviewer. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining Phase 0 (design specification section 10) acceptance gaps so the foundation literally meets its own bar, with one deliberate and documented deferral (`clean-code-pr`).

**Architecture:** Two plain-ESM tools under `scripts/` (matching `scripts/pack/`): an `rgb-audit` commit-history auditor (pure `parseGitLog` + `auditCommits`, plus a dependency-injected `runRgbAudit` shell) and a `commit-reminders` advisory pre-commit helper (pure `reminderMessages` + a `runCommitReminders` shell). One characterization unit test closes the last untested `core/` public method (`Dispatcher.canRedo`). CI gains a `ping-pong` job that runs `rgb:audit`; the pre-commit hook gains the advisory reminder line. The `clean-code-pr` gate is deliberately deferred and documented in the roadmap and a local ADR.

**Tech Stack:** Plain JSDoc-typed ESM (`.mjs`) for both tools, run under `node` with zero new dependencies (mirrors `scripts/knowledge-index.mjs` and `scripts/pack/`); Vitest with injected fakes for deterministic unit coverage; GitHub Actions for the `ping-pong` PR gate; Husky for the advisory pre-commit reminder.

**Scope boundary (design specification section 9.4, 9.5, 9.7, 9.11, and section 10 Phase 0 deliverables "`pnpm rgb:audit` script", "Pre-commit hooks ... clean-code warning", and acceptance criterion "clean-code-pr CI check passes on the bootstrap PR" and "All public functions in `core/` have unit tests"):**

In scope:

- `scripts/rgb-audit/` — a pure commit-history auditor enforcing the section 9.5 ping-pong invariants (RED precedes GREEN, GREEN touches no test files, GREEN closed by a BLUE) over a commit range, plus a dependency-injected CLI shell and a `pnpm rgb:audit` script.
- A descriptive `Infrastructure: <reason>` git-trailer exemption so controller-authored glue commits do not trip the auditor.
- A `ping-pong` CI job that runs `pnpm rgb:audit` on pull requests.
- `scripts/hooks/commit-reminders.mjs` — an advisory, non-blocking pre-commit helper that prints a clean-code review reminder when source layers change and a knowledge-update reminder when a source layer or `docs/specs/` changes, wired into `.husky/pre-commit`.
- A characterization unit test for `Dispatcher.canRedo()`, the one untested public function in `core/`.
- Roadmap status flip to done with a note recording the `clean-code-pr` deferral and its intended future implementation.
- A local ADR recording the audit-tooling design and the `clean-code-pr` deferral decision.

Out of scope and deliberately deferred:

- **`clean-code-pr` CI gate.** The clean-code-reviewer is an LLM agent that runs locally during the BLUE phase; the intended eventual implementation is a CI job that calls the model over the PR diff and fails on must-fix findings (decision recorded in the ADR and roadmap). Not built in this milestone.
- **Per-commit test execution in `rgb:audit`** ("each impl commit makes a previously-failing test pass" verified by checking out and running each commit): brittle and slow; documented as a possible future `--deep` mode. The static auditor enforces ordering, independence, and blue-presence only.
- **Blocking pre-commit behavior for the reminders:** the hook is advisory and always exits 0; it never fails a commit.

**Branch:** `feat/foundation-acceptance` (already created).

---

## File structure

New and modified files, grouped by responsibility:

```
scripts/rgb-audit/
  cycle-audit.mjs          (create)  parseGitLog, classifyCommit, auditCommits  [pure]
  cycle-audit.test.mjs     (create)  unit tests: parsing, ordering, independence, blue, exemptions
  rgb-audit.mjs            (create)  runRgbAudit(argv, deps) DI shell, real git readCommits, entry guard
  rgb-audit.test.mjs       (create)  unit tests: clean range exit 0, violations exit 1, range arg

scripts/hooks/
  commit-reminders.mjs       (create)  reminderMessages(paths) [pure] + runCommitReminders(deps) shell + entry
  commit-reminders.test.mjs  (create)  unit tests: source -> clean-code, spec/layer -> knowledge, none -> empty

core/commands/dispatcher.test.ts  (modify, infrastructure test)  add canRedo() characterization test

package.json             (modify, infrastructure)  "rgb:audit": "node scripts/rgb-audit/rgb-audit.mjs"
.husky/pre-commit        (modify, infrastructure)  append the advisory reminder line
.github/workflows/ci.yml (modify, infrastructure)  add the ping-pong pull_request job
ROADMAP.md               (modify, infrastructure)  flip Foundation acceptance to done + clean-code-pr deferral note
docs/knowledge/decisions/ADR-0025-rgb-audit-and-foundation-acceptance.md  (create, local, knowledge curation)
```

### Commit data shape (shared vocabulary used across tasks)

`parseGitLog` produces, and `auditCommits` consumes, objects of this shape:

```js
/**
 * @typedef {object} ParsedCommit
 * @property {string} sha          Full commit hash.
 * @property {string} type         Conventional-commit type, e.g. "feat", "test", "refactor". "" if unparseable.
 * @property {string} scope        Conventional-commit scope, e.g. "pack". "" if absent.
 * @property {string} subject      Description after the colon.
 * @property {string[]} files      Repo-relative paths changed by the commit.
 * @property {boolean} infra       True when an "Infrastructure:" trailer with a non-empty value is present.
 */
```

`auditCommits` returns an array of violations:

```js
/**
 * @typedef {object} Violation
 * @property {string} sha      The offending commit.
 * @property {"ordering"|"independence"|"blue"} rule
 * @property {string} message  Human-readable explanation.
 */
```

Classification used by `auditCommits` (see Task 2):

- **RED** = `type === 'test'` and `scope !== 'e2e'`
- **GREEN** = (`type === 'feat'` or `type === 'fix'`) and `infra === false`
- **BLUE** = `type === 'refactor'`
- **EXEMPT** (ignored) = everything else: `docs`, `chore`, `ci`, `build`, `style`, `perf`, `test` with scope `e2e`, any commit with `infra === true`, and unparseable commits.

Commits are audited oldest-first (the git reader passes `--reverse`).

---

## Task 1: parseGitLog parses commit records

**Files:**

- Create: `scripts/rgb-audit/cycle-audit.mjs`
- Test: `scripts/rgb-audit/cycle-audit.test.mjs`

The git reader (Task 6) invokes:

```
git log --reverse --no-merges <range> \
  --pretty=format:'%x1e%H%x1f%s%x1f%(trailers:key=Infrastructure,valueonly,separator=%x20)' \
  --name-only
```

Each commit is a record introduced by the RS byte `\x1e`. Its first line is three US-separated (`\x1f`) fields: `sha`, `subject`, and the joined `Infrastructure` trailer value (empty string when absent). The remaining non-empty lines until the next `\x1e` are changed file paths.

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it } from 'vitest'
import { parseGitLog } from './cycle-audit.mjs'

const RS = '\x1e'
const US = '\x1f'

function record(sha, subject, files, infra = '') {
  return `${RS}${sha}${US}${subject}${US}${infra}\n${files.join('\n')}\n`
}

describe('parseGitLog', () => {
  it('returns an empty array for empty output', () => {
    expect(parseGitLog('')).toEqual([])
  })

  it('parses sha, conventional type and scope, subject, files, and infra flag', () => {
    const raw =
      record('aaa', 'test: pin the widget', ['core/widget.test.ts']) +
      record('bbb', 'feat(widget): add the widget', ['core/widget.ts']) +
      record('ccc', 'chore: tidy build', ['package.json'], 'build wiring')

    const commits = parseGitLog(raw)

    expect(commits).toEqual([
      {
        sha: 'aaa',
        type: 'test',
        scope: '',
        subject: 'pin the widget',
        files: ['core/widget.test.ts'],
        infra: false,
      },
      {
        sha: 'bbb',
        type: 'feat',
        scope: 'widget',
        subject: 'add the widget',
        files: ['core/widget.ts'],
        infra: false,
      },
      {
        sha: 'ccc',
        type: 'chore',
        scope: '',
        subject: 'tidy build',
        files: ['package.json'],
        infra: true,
      },
    ])
  })

  it('treats an unparseable subject as empty type and scope', () => {
    const [commit] = parseGitLog(record('ddd', 'not a conventional subject', ['README.md']))
    expect(commit.type).toBe('')
    expect(commit.scope).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run scripts/rgb-audit/cycle-audit.test.mjs`
Expected: FAIL ("parseGitLog is not a function" / module has no such export).

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/rgb-audit/cycle-audit.mjs
//
// Pure helpers for the red-green-blue commit-history audit (design
// specification section 9.5). parseGitLog turns the raw `git log` output into
// structured commits; auditCommits enforces the ping-pong invariants.

/**
 * @typedef {object} ParsedCommit
 * @property {string} sha
 * @property {string} type      Conventional-commit type, "" if unparseable.
 * @property {string} scope     Conventional-commit scope, "" if absent.
 * @property {string} subject
 * @property {string[]} files
 * @property {boolean} infra    True when a non-empty Infrastructure trailer is present.
 */

/**
 * @typedef {object} Violation
 * @property {string} sha
 * @property {"ordering"|"independence"|"blue"} rule
 * @property {string} message
 */

const RECORD_SEPARATOR = '\x1e'
const FIELD_SEPARATOR = '\x1f'
const CONVENTIONAL = /^(\w+)(?:\(([^)]+)\))?!?:\s*(.+)$/

/**
 * @param {string} raw  Output of the project's `git log` invocation.
 * @returns {import('./cycle-audit.mjs').ParsedCommit[]}
 */
export function parseGitLog(raw) {
  return raw
    .split(RECORD_SEPARATOR)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => {
      const [header, ...fileLines] = chunk.split('\n')
      const [sha, subject = '', infraTrailer = ''] = header.split(FIELD_SEPARATOR)
      const match = CONVENTIONAL.exec(subject)
      return {
        sha,
        type: match ? match[1] : '',
        scope: match && match[2] ? match[2] : '',
        subject: match ? match[3] : subject,
        files: fileLines.map((line) => line.trim()).filter((line) => line.length > 0),
        infra: infraTrailer.trim().length > 0,
      }
    })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run scripts/rgb-audit/cycle-audit.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit (RED then GREEN)**

The test-author commits the test, the implementer commits the implementation:

```bash
git add scripts/rgb-audit/cycle-audit.test.mjs
git commit -m "test: pin git-log parsing for the rgb audit"
git add scripts/rgb-audit/cycle-audit.mjs
git commit -m "feat(scripts): parse git-log output into structured commits"
```

- [ ] **Step 6: BLUE** — run `/clean-code-review` then `/refactor`; a `refactor:` marker commit closes the phase.

---

## Task 2: auditCommits flags a GREEN commit with no preceding RED (ordering)

**Files:**

- Modify: `scripts/rgb-audit/cycle-audit.mjs`
- Test: `scripts/rgb-audit/cycle-audit.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import { auditCommits } from './cycle-audit.mjs'

function commit(overrides) {
  return { sha: 's', type: '', scope: '', subject: '', files: [], infra: false, ...overrides }
}

describe('auditCommits ordering', () => {
  it('passes when a RED test commit precedes the GREEN commit', () => {
    const violations = auditCommits([
      commit({ sha: 'r', type: 'test', files: ['core/w.test.ts'] }),
      commit({ sha: 'g', type: 'feat', files: ['core/w.ts'] }),
      commit({ sha: 'b', type: 'refactor' }),
    ])
    expect(violations).toEqual([])
  })

  it('flags a GREEN commit that has no preceding RED in range', () => {
    const violations = auditCommits([commit({ sha: 'g', type: 'feat', files: ['core/w.ts'] })])
    expect(violations).toEqual([
      { sha: 'g', rule: 'ordering', message: expect.stringContaining('no preceding') },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run scripts/rgb-audit/cycle-audit.test.mjs`
Expected: FAIL ("auditCommits is not a function").

- [ ] **Step 3: Write minimal implementation**

Append to `scripts/rgb-audit/cycle-audit.mjs`:

```js
function classify(commit) {
  if (commit.infra) return 'exempt'
  if (commit.type === 'test') return commit.scope === 'e2e' ? 'exempt' : 'red'
  if (commit.type === 'feat' || commit.type === 'fix') return 'green'
  if (commit.type === 'refactor') return 'blue'
  return 'exempt'
}

/**
 * @param {import('./cycle-audit.mjs').ParsedCommit[]} commits  Oldest-first.
 * @returns {import('./cycle-audit.mjs').Violation[]}
 */
export function auditCommits(commits) {
  const violations = []
  let pendingRed = 0
  for (const commit of commits) {
    const kind = classify(commit)
    if (kind === 'red') {
      pendingRed += 1
    } else if (kind === 'green') {
      if (pendingRed === 0) {
        violations.push({
          sha: commit.sha,
          rule: 'ordering',
          message: `GREEN commit ${commit.sha} has no preceding RED test commit in range`,
        })
      }
      pendingRed = 0
    }
  }
  return violations
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run scripts/rgb-audit/cycle-audit.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit (RED then GREEN)**

```bash
git add scripts/rgb-audit/cycle-audit.test.mjs
git commit -m "test: pin rgb-audit ordering rule"
git add scripts/rgb-audit/cycle-audit.mjs
git commit -m "feat(scripts): flag green commits with no preceding red"
```

- [ ] **Step 6: BLUE** — `/clean-code-review` then `/refactor`; `refactor:` marker closes the phase.

---

## Task 3: auditCommits flags a GREEN commit that modifies a test file (independence)

**Files:**

- Modify: `scripts/rgb-audit/cycle-audit.mjs`
- Test: `scripts/rgb-audit/cycle-audit.test.mjs`

A GREEN commit must change no `*.test.{ts,tsx,mjs,js}` file (the implementer never touches tests).

- [ ] **Step 1: Write the failing test**

```js
describe('auditCommits independence', () => {
  it('flags a GREEN commit that modifies a test file', () => {
    const violations = auditCommits([
      commit({ sha: 'r', type: 'test', files: ['core/w.test.ts'] }),
      commit({ sha: 'g', type: 'feat', files: ['core/w.ts', 'core/w.test.ts'] }),
      commit({ sha: 'b', type: 'refactor' }),
    ])
    expect(violations).toContainEqual({
      sha: 'g',
      rule: 'independence',
      message: expect.stringContaining('w.test.ts'),
    })
  })

  it('does not flag a GREEN commit that only changes implementation files', () => {
    const violations = auditCommits([
      commit({ sha: 'r', type: 'test', files: ['core/w.test.ts'] }),
      commit({ sha: 'g', type: 'feat', files: ['core/w.ts'] }),
      commit({ sha: 'b', type: 'refactor' }),
    ])
    expect(violations.some((v) => v.rule === 'independence')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run scripts/rgb-audit/cycle-audit.test.mjs`
Expected: FAIL (no independence violation produced).

- [ ] **Step 3: Write minimal implementation**

Add the test-file matcher and, inside the `green` branch of `auditCommits` (before resetting `pendingRed`), the independence check:

```js
const TEST_FILE = /\.test\.(ts|tsx|mjs|js)$/

// inside the `else if (kind === 'green')` branch, before `pendingRed = 0`:
const touchedTests = commit.files.filter((file) => TEST_FILE.test(file))
if (touchedTests.length > 0) {
  violations.push({
    sha: commit.sha,
    rule: 'independence',
    message: `GREEN commit ${commit.sha} modifies test file(s): ${touchedTests.join(', ')}`,
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run scripts/rgb-audit/cycle-audit.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit (RED then GREEN)**

```bash
git add scripts/rgb-audit/cycle-audit.test.mjs
git commit -m "test: pin rgb-audit independence rule"
git add scripts/rgb-audit/cycle-audit.mjs
git commit -m "feat(scripts): flag green commits that modify test files"
```

- [ ] **Step 6: BLUE** — `/clean-code-review` then `/refactor`; `refactor:` marker closes the phase.

---

## Task 4: auditCommits flags a GREEN commit not closed by a BLUE (blue presence)

**Files:**

- Modify: `scripts/rgb-audit/cycle-audit.mjs`
- Test: `scripts/rgb-audit/cycle-audit.test.mjs`

Every GREEN must be followed by a BLUE `refactor:` (the empty marker counts) before the next RED or the end of range.

- [ ] **Step 1: Write the failing test**

```js
describe('auditCommits blue presence', () => {
  it('flags a GREEN commit with no BLUE before the next RED', () => {
    const violations = auditCommits([
      commit({ sha: 'r1', type: 'test', files: ['a.test.ts'] }),
      commit({ sha: 'g1', type: 'feat', files: ['a.ts'] }),
      commit({ sha: 'r2', type: 'test', files: ['b.test.ts'] }),
    ])
    expect(violations).toContainEqual({
      sha: 'g1',
      rule: 'blue',
      message: expect.stringContaining('not closed by a BLUE'),
    })
  })

  it('flags a GREEN commit left open at the end of range', () => {
    const violations = auditCommits([
      commit({ sha: 'r', type: 'test', files: ['a.test.ts'] }),
      commit({ sha: 'g', type: 'feat', files: ['a.ts'] }),
    ])
    expect(violations).toContainEqual({
      sha: 'g',
      rule: 'blue',
      message: expect.stringContaining('not closed by a BLUE'),
    })
  })

  it('does not flag when a BLUE refactor closes the cycle', () => {
    const violations = auditCommits([
      commit({ sha: 'r', type: 'test', files: ['a.test.ts'] }),
      commit({ sha: 'g', type: 'feat', files: ['a.ts'] }),
      commit({ sha: 'b', type: 'refactor' }),
    ])
    expect(violations.some((v) => v.rule === 'blue')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run scripts/rgb-audit/cycle-audit.test.mjs`
Expected: FAIL (no blue violation produced).

- [ ] **Step 3: Write minimal implementation**

Track an open GREEN and resolve it on BLUE, on the next RED, and at end of range. Introduce `openGreen` (holds the sha or `null`) and a helper:

```js
// declare near `pendingRed`:
let openGreen = null

function flagOpenGreen(violations, openGreenSha) {
  if (openGreenSha) {
    violations.push({
      sha: openGreenSha,
      rule: 'blue',
      message: `GREEN commit ${openGreenSha} not closed by a BLUE refactor`,
    })
  }
}

// in the `red` branch, before incrementing pendingRed:
flagOpenGreen(violations, openGreen)
openGreen = null

// in the `green` branch, after the ordering and independence checks:
openGreen = commit.sha

// in a new `blue` branch:
} else if (kind === 'blue') {
  openGreen = null
}

// after the loop:
flagOpenGreen(violations, openGreen)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run scripts/rgb-audit/cycle-audit.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit (RED then GREEN)**

```bash
git add scripts/rgb-audit/cycle-audit.test.mjs
git commit -m "test: pin rgb-audit blue-presence rule"
git add scripts/rgb-audit/cycle-audit.mjs
git commit -m "feat(scripts): flag green commits not closed by a blue refactor"
```

- [ ] **Step 6: BLUE** — `/clean-code-review` then `/refactor`; `refactor:` marker closes the phase.

---

## Task 5: auditCommits exempts infrastructure and non-cycle commits

**Files:**

- Modify: `scripts/rgb-audit/cycle-audit.mjs`
- Test: `scripts/rgb-audit/cycle-audit.test.mjs`

Verifies the classification escape hatches already wired into `classify`: an `Infrastructure:`-trailered `feat:`, plus `docs`/`chore`/`ci`/`test(e2e)` commits, are ignored and never trip ordering or blue.

- [ ] **Step 1: Write the failing test**

```js
describe('auditCommits exemptions', () => {
  it('ignores an infrastructure-trailered feat commit', () => {
    const violations = auditCommits([
      commit({ sha: 'g', type: 'feat', files: ['package.json'], infra: true }),
    ])
    expect(violations).toEqual([])
  })

  it('ignores docs, chore, ci, and e2e-test commits entirely', () => {
    const violations = auditCommits([
      commit({ sha: 'd', type: 'docs', files: ['README.md'] }),
      commit({ sha: 'c', type: 'chore', files: ['package.json'] }),
      commit({ sha: 'i', type: 'ci', files: ['.github/workflows/ci.yml'] }),
      commit({ sha: 'e', type: 'test', scope: 'e2e', files: ['e2e/x.spec.ts'] }),
    ])
    expect(violations).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it passes immediately (characterization of `classify`)**

Run: `pnpm exec vitest run scripts/rgb-audit/cycle-audit.test.mjs`
Expected: PASS — `classify` (Task 2) already exempts these. If any test fails, the implementer adjusts `classify` minimally to satisfy it; otherwise this is a RED that documents existing behavior and proceeds straight to BLUE.

- [ ] **Step 3: Commit**

```bash
git add scripts/rgb-audit/cycle-audit.test.mjs
git commit -m "test: pin rgb-audit infrastructure and non-cycle exemptions"
```

If `classify` needed a change, the implementer commits it `feat(scripts): ...`.

- [ ] **Step 4: BLUE** — `/clean-code-review` then `/refactor`; `refactor:` marker closes the phase.

---

## Task 6: runRgbAudit shell maps a commit range to an exit code

**Files:**

- Create: `scripts/rgb-audit/rgb-audit.mjs`
- Test: `scripts/rgb-audit/rgb-audit.test.mjs`

The shell is dependency-injected (mirrors `runPackCli` in `scripts/pack/vernacular-pack.mjs`): it takes `argv` and `{ runGit, log }`. It resolves the range (default `main..HEAD`, or the first non-flag argv entry, or `--range <value>`), calls `runGit` to get raw log output, parses and audits it, prints a report through `log`, and returns `0` when clean or `1` when there are violations.

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it, vi } from 'vitest'
import { runRgbAudit } from './rgb-audit.mjs'

const RS = '\x1e'
const US = '\x1f'
function record(sha, subject, files, infra = '') {
  return `${RS}${sha}${US}${subject}${US}${infra}\n${files.join('\n')}\n`
}

describe('runRgbAudit', () => {
  it('returns 0 and reports a clean audit for a compliant range', async () => {
    const raw =
      record('r', 'test: pin w', ['core/w.test.ts']) +
      record('g', 'feat: add w', ['core/w.ts']) +
      record('b', 'refactor: tidy w', [])
    const log = vi.fn()
    const runGit = vi.fn(() => raw)

    const code = await runRgbAudit([], { runGit, log })

    expect(code).toBe(0)
    expect(runGit).toHaveBeenCalledTimes(1)
    expect(log.mock.calls.flat().join('\n')).toContain('clean')
  })

  it('returns 1 and reports violations for a non-compliant range', async () => {
    const raw = record('g', 'feat: add w', ['core/w.ts'])
    const log = vi.fn()

    const code = await runRgbAudit([], { runGit: () => raw, log })

    expect(code).toBe(1)
    expect(log.mock.calls.flat().join('\n')).toContain('ordering')
  })

  it('passes an explicit --range through to runGit', async () => {
    const runGit = vi.fn(() => '')
    await runRgbAudit(['--range', 'origin/main..feature'], { runGit, log: vi.fn() })
    expect(runGit.mock.calls[0][0]).toContain('origin/main..feature')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run scripts/rgb-audit/rgb-audit.test.mjs`
Expected: FAIL ("runRgbAudit is not a function").

- [ ] **Step 3: Write minimal implementation**

```js
#!/usr/bin/env node
// scripts/rgb-audit/rgb-audit.mjs
//
// Audits the red-green-blue commit history of a range (design specification
// section 9.5). Exits 0 when the range is clean, 1 on violations, 2 on an
// internal error. The shell is dependency-injected for deterministic tests;
// the entry guard wires the real git reader.

import { execFileSync } from 'node:child_process'
import { parseGitLog, auditCommits } from './cycle-audit.mjs'

// Local default; CI passes an explicit --range so it never depends on this.
const DEFAULT_RANGE = 'main..HEAD'

function resolveRange(argv) {
  const flagIndex = argv.indexOf('--range')
  if (flagIndex !== -1 && argv[flagIndex + 1]) return argv[flagIndex + 1]
  const positional = argv.find((arg) => !arg.startsWith('-'))
  return positional ?? DEFAULT_RANGE
}

function gitLogArgs(range) {
  return [
    'log',
    '--reverse',
    '--no-merges',
    range,
    '--pretty=format:%x1e%H%x1f%s%x1f%(trailers:key=Infrastructure,valueonly,separator=%x20)',
    '--name-only',
  ]
}

/**
 * @param {string[]} argv
 * @param {{ runGit: (args: string[]) => string, log: (line: string) => void }} deps
 * @returns {Promise<number>} process exit code
 */
export async function runRgbAudit(argv, { runGit, log }) {
  const range = resolveRange(argv)
  const raw = runGit(gitLogArgs(range))
  const violations = auditCommits(parseGitLog(raw))
  if (violations.length === 0) {
    log(`rgb:audit: clean (${range})`)
    return 0
  }
  log(`rgb:audit: ${violations.length} violation(s) in ${range}`)
  for (const violation of violations) {
    log(`  [${violation.rule}] ${violation.message}`)
  }
  return 1
}

const isEntry = process.argv[1] && process.argv[1].endsWith('rgb-audit.mjs')
if (isEntry) {
  const runGit = (args) => execFileSync('git', args, { encoding: 'utf8' })
  runRgbAudit(process.argv.slice(2), { runGit, log: (line) => console.log(line) })
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`rgb:audit: ${error.message}`)
      process.exit(2)
    })
}
```

Note: `no-console` is disallowed in app/library code but the existing CLIs (`scripts/pack/`, `scripts/knowledge-index.mjs`) use `console` in their entry guards; ESLint ignores `scripts/` for that rule. Confirm `pnpm lint` stays green in Step 4.

- [ ] **Step 4: Run test to verify it passes; confirm lint**

Run: `pnpm exec vitest run scripts/rgb-audit/rgb-audit.test.mjs && pnpm lint`
Expected: PASS (3 tests); lint exits 0.

- [ ] **Step 5: Commit (RED then GREEN)**

```bash
git add scripts/rgb-audit/rgb-audit.test.mjs
git commit -m "test: pin the rgb-audit shell exit codes"
git add scripts/rgb-audit/rgb-audit.mjs
git commit -m "feat(scripts): map a commit range to an rgb-audit exit code"
```

- [ ] **Step 6: BLUE** — `/clean-code-review` then `/refactor`; `refactor:` marker closes the phase.

---

## Task 7: Wire the rgb:audit script and confirm a clean self-audit (infrastructure)

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Add the script**

Add to `package.json` `scripts`, immediately after `"pack:validate"`:

```json
"rgb:audit": "node scripts/rgb-audit/rgb-audit.mjs",
```

- [ ] **Step 2: Run the auditor against this branch**

Run: `pnpm rgb:audit`
Expected: `rgb:audit: clean (main..HEAD)`, exit 0. Every behavior task above is a RED-GREEN-BLUE triple; the infrastructure commits are exempt (their `build:`/`ci:`/`docs:` types, reinforced by the `Infrastructure:` trailer), so the range is clean.

If it reports a violation, fix the offending commit sequence (e.g., add a missing `Infrastructure:` trailer with a follow-up amend, or land a `refactor:` marker) before continuing.

- [ ] **Step 3: Run the full check chain**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
Expected: all green.

- [ ] **Step 4: Commit with the infrastructure trailer**

```bash
git add package.json
git commit -m "build(scripts): expose the rgb:audit command" \
  --trailer "Infrastructure: package.json script wiring for the rgb audit"
```

- [ ] **Step 5: BLUE** — `/clean-code-review` over the diff; apply any fixes in place. No marker commit is needed for an infrastructure change.

---

## Task 8: reminderMessages selects advisory pre-commit reminders

**Files:**

- Create: `scripts/hooks/commit-reminders.mjs`
- Test: `scripts/hooks/commit-reminders.test.mjs`

Pure function: given staged repo-relative paths, return the advisory lines to print. A clean-code reminder when any source-layer file changed; a knowledge-update reminder when any source-layer file or any `docs/specs/` file changed; nothing when only unrelated files (config, docs other than specs) changed.

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it } from 'vitest'
import { reminderMessages } from './commit-reminders.mjs'

describe('reminderMessages', () => {
  it('returns no reminders for non-source changes', () => {
    expect(reminderMessages(['package.json', 'README.md'])).toEqual([])
  })

  it('reminds about clean-code review when a source layer changes', () => {
    const messages = reminderMessages(['core/model/types.ts'])
    expect(messages.join('\n')).toContain('clean-code')
  })

  it('reminds about the knowledge graph when a source layer changes', () => {
    const messages = reminderMessages(['engine/scene/build-scene.ts'])
    expect(messages.join('\n')).toContain('knowledge')
  })

  it('reminds about the knowledge graph when the design specification changes', () => {
    const messages = reminderMessages(['docs/specs/2026-06-01-vernacular-design.md'])
    expect(messages.join('\n')).toContain('knowledge')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run scripts/hooks/commit-reminders.test.mjs`
Expected: FAIL ("reminderMessages is not a function").

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/hooks/commit-reminders.mjs
//
// Advisory, non-blocking pre-commit reminders (design specification section 10
// Phase 0: clean-code warning and knowledge-update warning). Pure selection
// plus a thin shell; the hook always exits 0.

const SOURCE_LAYER = /^(core|storage|engine|bridge|editor|app)\//
const DESIGN_SPEC = /^docs\/specs\//

const CLEAN_CODE_REMINDER =
  'Reminder: run /clean-code-review on this diff before opening a PR (BLUE phase is non-optional).'
const KNOWLEDGE_REMINDER =
  'Reminder: consider whether this change needs a knowledge-graph (ADR) update.'

/**
 * @param {string[]} paths  Staged repo-relative file paths.
 * @returns {string[]}      Advisory lines, empty when nothing applies.
 */
export function reminderMessages(paths) {
  const touchesSource = paths.some((path) => SOURCE_LAYER.test(path))
  const touchesSpec = paths.some((path) => DESIGN_SPEC.test(path))
  const messages = []
  if (touchesSource) messages.push(CLEAN_CODE_REMINDER)
  if (touchesSource || touchesSpec) messages.push(KNOWLEDGE_REMINDER)
  return messages
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run scripts/hooks/commit-reminders.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit (RED then GREEN)**

```bash
git add scripts/hooks/commit-reminders.test.mjs
git commit -m "test: pin advisory pre-commit reminder selection"
git add scripts/hooks/commit-reminders.mjs
git commit -m "feat(scripts): select advisory clean-code and knowledge reminders"
```

- [ ] **Step 6: BLUE** — `/clean-code-review` then `/refactor`; `refactor:` marker closes the phase.

---

## Task 9: Wire the advisory reminder into pre-commit (infrastructure)

**Files:**

- Modify: `scripts/hooks/commit-reminders.mjs` (add the shell + entry guard)
- Modify: `.husky/pre-commit`

- [ ] **Step 1: Add the shell and entry guard**

Append to `scripts/hooks/commit-reminders.mjs`:

```js
import { execFileSync } from 'node:child_process'

/**
 * @param {{ stagedPaths: () => string[], log: (line: string) => void }} deps
 */
export function runCommitReminders({ stagedPaths, log }) {
  for (const message of reminderMessages(stagedPaths())) {
    log(message)
  }
}

const isEntry = process.argv[1] && process.argv[1].endsWith('commit-reminders.mjs')
if (isEntry) {
  const stagedPaths = () =>
    execFileSync('git', ['diff', '--cached', '--name-only'], { encoding: 'utf8' })
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  runCommitReminders({ stagedPaths, log: (line) => console.log(line) })
}
```

- [ ] **Step 2: Append the hook line**

Add to `.husky/pre-commit` after the existing `pnpm exec lint-staged` line:

```sh
node scripts/hooks/commit-reminders.mjs
```

- [ ] **Step 3: Verify the hook is advisory (never blocks)**

Run: `node scripts/hooks/commit-reminders.mjs; echo "exit: $?"`
Expected: prints any applicable reminders for the current staging area and `exit: 0`.

- [ ] **Step 4: Run the full check chain**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
Expected: all green.

- [ ] **Step 5: Commit with the infrastructure trailer**

```bash
git add scripts/hooks/commit-reminders.mjs .husky/pre-commit
git commit -m "build(hooks): print advisory reminders in pre-commit" \
  --trailer "Infrastructure: husky hook wiring for advisory reminders"
```

- [ ] **Step 6: BLUE** — `/clean-code-review` over the diff; apply any fixes in place. No marker commit is needed for an infrastructure change.

---

## Task 10: Characterization test for Dispatcher.canRedo (infrastructure test)

**Files:**

- Modify: `core/commands/dispatcher.test.ts`

`Dispatcher.canRedo()` is the one untested public function in `core/` (acceptance criterion "All public functions in `core/` have unit tests"). The behavior already exists, so this is a characterization test that passes on first run; it is dispatched through the test-author to keep test ownership with that role.

- [ ] **Step 1: RED — dispatch the test-author**

Run `/test-first` for: "Dispatcher.canRedo reflects whether a redoable command is on the redo stack: false on a fresh dispatcher, true after a dispatched command is undone, and false again after that command is redone."

The test-author writes a test in `core/commands/dispatcher.test.ts` covering: fresh dispatcher -> `canRedo()` is `false`; dispatch then undo -> `canRedo()` is `true`; redo -> `canRedo()` is `false`.

- [ ] **Step 2: Run the new test**

Run: `pnpm exec vitest run core/commands/dispatcher.test.ts`
Expected: PASS — pins existing behavior (no GREEN implementation needed). The test-author commits it `test: pin Dispatcher.canRedo redo-stack reporting`.

- [ ] **Step 3: Confirm the coverage gap is closed**

Run: `pnpm exec vitest run core --coverage --coverage.reporter=text | grep dispatcher`
Expected: `dispatcher.ts` functions at 100% (lines 64-66 now covered).

- [ ] **Step 4: BLUE** — `/clean-code-review` over the test diff; land an empty `refactor:` marker if no changes.

---

## Task 11: Add the ping-pong CI job (infrastructure)

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add the job**

Add a job after `check` (it needs full history, so `fetch-depth: 0`, and only runs on pull requests where a base ref exists):

```yaml
ping-pong:
  name: Ping-pong compliance
  if: github.event_name == 'pull_request'
  runs-on: ubuntu-latest
  needs: check
  steps:
    - name: Checkout
      uses: actions/checkout@v4
      with:
        fetch-depth: 0

    - name: Set up pnpm
      uses: pnpm/action-setup@v3
      with:
        version: 10.33.4

    - name: Set up Node
      uses: actions/setup-node@v4
      with:
        node-version-file: '.nvmrc'
        cache: 'pnpm'

    - name: Install dependencies
      run: pnpm install --frozen-lockfile

    - name: Audit the red-green-blue commit history
      run: pnpm rgb:audit --range "origin/${{ github.base_ref }}..HEAD"
```

- [ ] **Step 2: Validate the workflow locally**

Run: `node -e "require('node:fs').readFileSync('.github/workflows/ci.yml','utf8')" && pnpm exec prettier --check .github/workflows/ci.yml`
Expected: no error; prettier reports the file is formatted (or run `pnpm format` to fix).

- [ ] **Step 3: Commit with the infrastructure trailer**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: audit red-green-blue compliance on pull requests" \
  --trailer "Infrastructure: CI job wiring for the rgb audit"
```

- [ ] **Step 4: BLUE** — `/clean-code-review` over the diff; apply any fixes in place. No marker commit is needed for an infrastructure change.

---

## Task 12: Mark Foundation acceptance done and record the clean-code-pr deferral (infrastructure)

**Files:**

- Modify: `ROADMAP.md`

- [ ] **Step 1: Flip the status**

In the Foundation work table, change the `Foundation acceptance` row status from `pending` to `done`.

- [ ] **Step 2: Add the deferral note**

Add, immediately below the Foundation work table:

```markdown
> **Deferred from Phase 0 with intent:** the `clean-code-pr` CI gate (design specification sections 9.7 and 9.11) is not yet built. The clean-code-reviewer is an LLM agent that runs locally during the BLUE phase; the intended implementation is a CI job that runs the reviewer over the pull-request diff and fails on must-fix findings. It needs an API credential, per-PR cost, and non-deterministic-output handling, so it is scheduled as a follow-on rather than a Phase 0 blocker. The ping-pong (`rgb:audit`) gate enforces the red-green-blue ordering, independence, and blue-presence invariants in the meantime.
```

- [ ] **Step 3: Commit with the infrastructure trailer**

```bash
git add ROADMAP.md
git commit -m "docs: mark foundation acceptance done and record the clean-code-pr deferral" \
  --trailer "Infrastructure: roadmap status and deferral note"
```

- [ ] **Step 4: BLUE** — `/clean-code-review` over the diff; apply any fixes in place. No marker commit is needed for an infrastructure change.

---

## Task 13: Knowledge curation (knowledge curation, local-only)

**Files:**

- Create: `docs/knowledge/decisions/ADR-0025-rgb-audit-and-foundation-acceptance.md` (gitignored, local)

- [ ] **Step 1: Run the knowledge curator**

Dispatch the `knowledge-curator` (or use `/adr rgb-audit-and-foundation-acceptance "RGB audit and foundation acceptance"`). The ADR records:

- The decision to enforce section 9.5 ping-pong invariants statically via `rgb:audit` (ordering, independence, blue-presence), and why per-commit test execution is out of scope.
- The `Infrastructure: <reason>` trailer convention as the exemption mechanism, and why a descriptive trailer was chosen over a SHA allowlist or scope heuristics (naming policy, rebase-survivability, self-documentation).
- The `clean-code-pr` deferral and its intended eventual implementation (in-CI LLM reviewer over the PR diff, failing on must-fix), so a future session has the context.
- Relations to the existing test-pyramid / RGB and ESLint-guardrails ADRs.

- [ ] **Step 2: Regenerate the local index**

Run: `pnpm knowledge:index`
Expected: `docs/knowledge/INDEX.md` and `index.json` regenerate without schema errors.

- [ ] **Step 3: No commit**

The knowledge graph is gitignored; nothing to commit.

---

## Final verification (before /review)

- [ ] **Full check chain:** `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` — all green.
- [ ] **Self-audit:** `pnpm rgb:audit` — reports `clean` for `main..HEAD`.
- [ ] **Coverage:** `pnpm exec vitest run core --coverage --coverage.reporter=text` — `core/commands/dispatcher.ts` functions at 100%.
- [ ] **PR-level review:** `/review` dispatches the pr-reviewer; resolve findings.
- [ ] **Acceptance recheck:** confirm each Phase 0 acceptance criterion (section 10) is satisfied, with `clean-code-pr` recorded as a documented deferral.
