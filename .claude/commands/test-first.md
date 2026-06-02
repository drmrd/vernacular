---
description: 'Dispatch the test-author agent for the RED phase'
argument-hint: '<feature or behavior description>'
allowed-tools: ['Task']
---

# /test-first

Dispatch the `test-author` subagent to write the next failing test in a red-green-blue TDD cycle. Treat `$ARGUMENTS` as the behavior description.

The subagent will:

1. Read the spec, relevant knowledge entries, and existing tests.
2. Write one failing test.
3. Confirm RED by running the test suite.
4. Commit with a `test:` prefix.

After this command, run `/implement` next to move to the GREEN phase.
