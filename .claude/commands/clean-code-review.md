---
description: 'Dispatch the clean-code-reviewer agent'
argument-hint: '[optional commit range, defaults to HEAD~1..HEAD]'
allowed-tools: ['Task']
---

# /clean-code-review

Dispatch the `clean-code-reviewer` subagent to audit the most recent commit (or the range you pass) against `.claude/rules.md`. The reviewer produces a structured report with must-fix, should-fix, and consider findings.

Use this in the BLUE phase of the red-green-blue cycle, immediately after `/implement` and before `/refactor`.
