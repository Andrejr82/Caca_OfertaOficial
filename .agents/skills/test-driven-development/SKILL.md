---
name: test-driven-development
description: Use for feature work, bug fixes, refactors, or behavior changes. Requires a failing test before implementation code whenever testing is reasonably possible.
source: https://github.com/obra/superpowers/tree/main/skills/test-driven-development
adapted_for: Caca_OfertaOficial
---

# Test-Driven Development

## Core rule

No production behavior change without first creating a test that demonstrates the missing or incorrect behavior, unless the task is inherently non-testable (for example pure configuration or generated files).

## Project precedence

Repository rules, security requirements, user instructions, migrations, executable code, and existing test conventions take precedence over this skill.

## Workflow

1. Inspect the current implementation and existing tests.
2. Write the smallest test that captures the intended behavior.
3. Run that test and confirm it fails for the expected reason.
4. Implement the minimum change necessary to pass it.
5. Run the focused test again and confirm it passes.
6. Refactor only if needed, preserving the passing test.
7. Run broader relevant validation before declaring success.

## Evidence rules

- A test that was never observed failing does not prove the new behavior was covered.
- Do not weaken or delete tests just to obtain green output.
- For regressions, reproduce the bug with a test before fixing it whenever viable.
- Follow the repository's existing test structure and naming conventions.

## Stop conditions

Stop and report rather than guessing when a required dependency, test harness, credential, environment, or authoritative behavior cannot be determined safely.
