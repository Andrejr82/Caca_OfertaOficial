---
name: verification-before-completion
description: Require fresh checks before saying a change is complete or working.
source: https://github.com/obra/superpowers/tree/main/skills/verification-before-completion
adapted_for: Caca_OfertaOficial
---

# Verification Before Completion

Do not claim success without fresh evidence from the current branch.

Workflow:
1. Identify the check that proves the claim.
2. Run it after the final change.
3. Read the result and failures.
4. Report failures or missing checks plainly.
5. Only then state what is verified.

For this repository, use focused tests first, then relevant lint/typecheck/build checks. Documentation changes require `npm run docs:audit`. Run `npm run verify` when the environment permits.

A repository check does not prove external deployment state. If a required check cannot run, record the command, reason, and remaining risk.
