---
name: using-git-worktrees
description: Ensure implementation work is isolated from main before executing a plan.
source: https://github.com/obra/superpowers/tree/main/skills/using-git-worktrees
adapted_for: Caca_OfertaOficial
---

# Isolated Development Workspace

Before implementation, confirm work is not being written directly to `main`.

Preferred order:
1. If the harness provides a native isolated workspace/worktree, use it.
2. If operating through the GitHub connector without a local checkout, use a dedicated task branch created from the current `main` and verify it is not behind before starting.
3. If using local git, use an existing safe worktree convention or create one only with user consent and after checking ignore rules.

For this project, never move or force-update `main`. Preserve existing branch work and do not clean up branches/worktrees without explicit authorization.
