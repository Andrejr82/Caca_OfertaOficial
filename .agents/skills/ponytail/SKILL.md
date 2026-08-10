---
name: ponytail
description: Prefer the smallest correct implementation. Reuse existing code, native platform features, standard library, and installed dependencies before adding abstractions or packages.
source: https://github.com/DietrichGebert/ponytail/tree/main/skills/ponytail
adapted_for: Caca_OfertaOficial
---

# Ponytail

Build less, not less safely.

Rules:
- Understand the existing code before adding anything.
- Reuse existing modules and patterns first.
- Prefer native capabilities and already-installed dependencies.
- Do not add abstraction layers for hypothetical future needs.
- Keep diffs focused on the requested behavior.
- Do not simplify authentication, validation, data integrity, evidence rules, marketplace identity, or publication guards.
- If one small function or type solves the requirement, do not build a framework.

For this project, simplicity never overrides explicit requirements, migrations, security boundaries, evidence provenance, or runtime correctness.
