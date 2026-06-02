---
description: 'Dispatch the pr-reviewer agent for the full PR'
argument-hint: '[optional PR number, defaults to the current branch PR]'
allowed-tools: ['Task', 'Bash']
---

# /review

Dispatch the `pr-reviewer` subagent for a comprehensive pre-merge audit of the pull request. The reviewer walks the entire branch, verifies red-green-blue adherence in commit history, checks for Co-Authored-By trailers (must be zero), confirms required knowledge graph updates landed, and validates CI status. Produces a verdict of ✅ Approve, ⚠️ Approve with follow-up, or ❌ Request changes.
