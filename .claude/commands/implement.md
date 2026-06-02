---
description: 'Dispatch the implementer agent for the GREEN phase'
argument-hint: '[optional context or constraints for the implementation]'
allowed-tools: ['Task']
---

# /implement

Dispatch the `implementer` subagent to make the most recent failing test pass with the minimum implementation.

The subagent will:

1. Find the failing test (typically the latest `test:` commit on this branch).
2. Read relevant spec and knowledge entries.
3. Write or modify implementation files in the appropriate layer.
4. Confirm GREEN by re-running the test suite and the full check chain.
5. Commit with a `feat:` or `fix:` prefix.

After this command, run `/clean-code-review` next to move toward the BLUE phase.
