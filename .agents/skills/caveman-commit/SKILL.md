---
name: caveman-commit
description: Produce short, precise Conventional Commit messages that describe the actual diff. Does not authorize committing, pushing, amending, or merging.
source: https://github.com/JuliusBrussee/caveman/tree/main/skills/caveman-commit
adapted_for: Caca_OfertaOficial
---

# Caveman Commit

When a commit message is needed, describe only what changed.

Format:
`type(scope): concise action`

Rules:
- Prefer `feat`, `fix`, `test`, `docs`, `refactor`, `chore` as appropriate.
- Keep the subject short and specific.
- Do not claim validation or behavior not proven by the diff and checks.
- Avoid marketing language, filler, and implementation trivia.
- Follow the repository's observed convention when it differs.

This skill only generates commit wording. It never grants permission to stage, commit, amend, push, merge, force-push, or delete branches.
