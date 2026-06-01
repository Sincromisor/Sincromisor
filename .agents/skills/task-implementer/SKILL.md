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
2. Implement the smallest coherent change that satisfies `task.md` and review constraints.
3. Update corresponding docs, compose, sample env, or design docs when behavior or configuration
   changes.
4. Run relevant checks from `tasks/README.md`.
5. Append to `impl.md`:
    - attempt number
    - changed files and rationale
    - verification commands and results
    - checks not run and why
    - deviations from review, if any
6. Commit implementation changes and `impl.md`. Include the canonical task ID in the commit message.

## Guardrails

- Preserve unrelated user changes in the working tree.
- Treat WebRTC endpoint, JSON, DataChannel, and msgpack changes as breaking unless task docs say
  otherwise.
- Avoid broad refactors outside the task scope.
- If evaluation failed, address the concrete findings in `eval.md` and record the retry in `impl.md`.
