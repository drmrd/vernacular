---
slug: decisions/ADR-0011-agent-command-architecture
title: 'ADR-0011: Project subagent and slash-command architecture'
type: decision
tags: [agents, slash-commands, workflow, tdd, claude-code]
related: [decisions/ADR-0009-test-pyramid-rgb-tdd]
sourceFiles: [CLAUDE.md, .claude/rules.md, .claude/agents, .claude/commands]
status: current
updated: 2026-06-02
---

# ADR-0011: Project subagent and slash-command architecture

## Status

Accepted. Implemented in Phase 0c.2.

## Context

The Vernacular project commits to militant red-green-blue TDD with independent agents (ADR-0009). The Claude Code platform supports project-local agents in `.claude/agents/` and slash commands in `.claude/commands/`. We need to decide which agents and commands we ship, what each one's scope is, and how the access-control intent (test-author cannot read implementation source; implementer cannot read tests) is realized in practice.

## Decision

Six project-local subagents, each defined as a Markdown file with YAML frontmatter in `.claude/agents/`:

- `test-author`: writes failing tests; tools restricted to file operations and bash; system prompt forbids reading implementation source.
- `implementer`: writes the minimal implementation; tools as above; system prompt forbids reading test files.
- `refactorer`: applies refactors at the BLUE phase; tools as above; system prompt forbids modifying tests.
- `clean-code-reviewer`: audits the diff against `.claude/rules.md`; read-only tools.
- `pr-reviewer`: end-of-branch audit; read-only tools plus bash and `Task`.
- `knowledge-curator`: proposes updates to `docs/knowledge/`; tools include write access scoped to that directory.

Seven slash commands in `.claude/commands/` drive the workflow:

- `/knowledge [query]`: queries the index via a small Node one-liner.
- `/adr <slug> "Title"`: scaffolds a new ADR via a Node one-liner; the curator may then flesh it out.
- `/test-first <behavior>`: dispatches `test-author`.
- `/implement`: dispatches `implementer`.
- `/refactor`: dispatches `refactorer`.
- `/clean-code-review`: dispatches `clean-code-reviewer`.
- `/review`: dispatches `pr-reviewer`.

## Access-control realization

Claude Code does not have a built-in path-based file-access wrapper today. The "independent agents" property described in ADR-0009 is enforced by three mechanisms used together:

1. **System-prompt instructions.** Each agent's system prompt is explicit about what it may and may not read or modify, with reasons.
2. **Tools allowlist.** Each agent is granted only the tools it needs (e.g., the `clean-code-reviewer` does not have `Edit` because it produces a report, not changes).
3. **Commit history audit at PR time.** The `pr-reviewer` agent verifies the commit pattern matches RGB and flags any anomalies (an `implementer` commit that modified test files, a `test-author` commit that touched implementation source).

A future enhancement would add hook-based or wrapper-based hard enforcement; that is out of scope today.

## Consequences

- The TDD workflow is invokable as a sequence of slash commands: `/test-first`, `/implement`, `/clean-code-review`, `/refactor`, repeat.
- Pre-merge audit is one command: `/review`.
- Adding a new agent is a Markdown file with frontmatter and a system prompt; adding a new command is similar. Both are versioned with the repository.
- The pack-validator and migration-author agents listed in the design specification are deferred to Phase 0i when packs and registry migrations become real.

## References

- Design specification, section 8.8 (Subagents) and section 8.9 (Custom slash commands).
- ADR-0009 (test pyramid and red-green-blue TDD).
- Claude Code documentation on `.claude/agents/` and `.claude/commands/` formats.
