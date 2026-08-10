---
name: executing-plans
description: Use when a written implementation plan already exists. Execute tasks in order, keep scope tight, validate each delivery, and stop only for real blockers or explicit approval gates.
source: https://github.com/obra/superpowers/tree/main/skills/executing-plans
adapted_for: Caca_OfertaOficial
---

# Executing Plans

## Core rule

Load the approved plan, review it against the current repository state, then execute tasks in order without silently expanding scope.

## Isolation

Before implementation, confirm work is isolated from `main`. In this project, an approved task branch accessed through the GitHub integration satisfies the isolation requirement when no local worktree is available.

## Workflow

1. Read the implementation plan and current `main` state.
2. Confirm the active task branch is appropriate and preserves prior work.
3. Identify the next incomplete task and its acceptance criteria.
4. Apply TDD when behavior changes are testable.
5. Make the smallest correct change.
6. Run focused validation for that task.
7. Update plan/task documentation only when status genuinely changed.
8. Continue to the next task unless the plan has an explicit human approval gate.

## Blockers

Stop and report when:
- the plan conflicts with current executable code or migrations;
- a required tool/skill/dependency is unavailable;
- proceeding would require deploy, production migration, destructive action, merge, force-push, secret access, or another action needing explicit authorization;
- a failed validation shows the planned approach is wrong.

## Completion

Never call a task complete without fresh verification evidence. Use the verification-before-completion skill before making success claims.
