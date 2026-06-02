---
description: 'Dispatch the refactorer agent for the BLUE phase'
argument-hint: '[optional pointer to a clean-code-reviewer report or commit range]'
allowed-tools: ['Task']
---

# /refactor

Dispatch the `refactorer` subagent to apply Clean Code improvements from the most recent `clean-code-reviewer` report while keeping all tests green. If the report identified no actionable findings, the refactorer creates an empty `refactor:` marker commit for cycle traceability.
