---
name: task-implementer
description: Implement an approved Sincromisor task, update impl.md, run relevant checks, and commit implementation changes without touching meta.yaml or eval.md.
---

# Task Implementer

Use this skill only as an implementer subagent after parent Codex records an approved review.

## Read

- `task.md`
- `meta.yaml`
- `review.md`
- Previous `eval.md` when retrying after FAIL
- Relevant design, rule, source, test, compose, and config files

## Write

- Implementation files and tests required by the task
- `impl.md`
- Optional task-local files under `artifacts/`

Do not edit `meta.yaml`, `eval.md`, generated category `index.md`, or close-state fields. Do not
overwrite reviewer or evaluator output.

## Workflow

1. Confirm `review.md` verdict is `APPROVED`.
2. Confirm the parent has established a clean boundary. Prefer the existing checkout and a
   `codex/<task-id>` branch; do not create a physical `git worktree` unless the parent explicitly
   asks for isolation.
3. Implement the smallest coherent change that satisfies `task.md` and review constraints.
4. Update corresponding docs, compose, sample env, or design docs when behavior or configuration
   changes.
5. Run relevant checks from `tasks/README.md`, including the 3 point gate for the changed surface.
6. Append to `impl.md`:
    - completion summary for parent Codex
    - attempt number
    - changed files and rationale
    - verification commands and results
    - checks not run and why
    - deviations from review, if any
7. Commit implementation changes and `impl.md`. Include the canonical task ID in the commit message.

## Guardrails

- Preserve unrelated user changes in the working tree.
- Treat WebRTC endpoint, JSON, DataChannel, and msgpack changes as breaking unless task docs say
  otherwise.
- Avoid broad refactors outside the task scope.
- If evaluation failed, address the concrete findings in `eval.md` and record the retry in `impl.md`.
- Do not edit evaluator-owned `acceptance/` files, `eval.md`, `meta.yaml`, or generated indexes.
- Do not report completion with uncommitted implementation changes left in the working tree.

## Implementation Log

`impl.md` is append-only after the first attempt. Do not delete or rewrite earlier attempt notes.
For each attempt, add a new attempt section that records why choices were made, deviations from the
approved task or review, verification results, skipped checks, and remaining risk. Keep large command
logs in `artifacts/` when they are useful, and summarize the important result in `impl.md`.

The commit is the source of truth for what changed. `impl.md` should explain context, judgment, and
verification rather than duplicating the full diff.

## Verification Gate

Run the changed surface's 3 point gate before completion:

- lint / format check
- type check or build
- tests that cover the acceptance conditions

Use project commands from `tasks/README.md`. If a check is too expensive or not relevant, record the
reason and residual risk in `impl.md` instead of silently skipping it.

## Completion Summary

`impl.md` must include a `## Completion Summary` section for parent Codex to relay to the user after
the implementer finishes. Include:

- implementation status
- changed files and rationale
- commit hash, if commit succeeded
- verification commands and results
- checks not run and why
- deviations, residual risks, or follow-ups
