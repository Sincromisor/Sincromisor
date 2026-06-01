---
name: sincromisor-task-runner
description: Run Sincromisor tasks through a Codex parent workflow that separates reviewer, implementer, evaluator, task metadata updates, and close commits.
---

# Sincromisor Task Runner

Use this skill when the user explicitly asks to run a Sincromisor task pipeline, use subagents,
or use this runner skill.

## Inputs

- Task directory: `tasks/<category>/task-<id>-<slug>/`
- Canonical docs: `tasks/README.md`, `AGENTS.md`, relevant `documents/design/` and
  `documents/rules/`
- Task files: `task.md`, `meta.yaml`, optional `review.md`, `impl.md`, `eval.md`

## Parent Workflow

1. Read `task.md`, `meta.yaml`, `tasks/README.md`, and relevant project docs.
2. Start a reviewer subagent with the `task-reviewer` skill. The reviewer writes only `review.md`.
3. After the reviewer finishes, read `review.md` and report the review completion summary to the
   user before continuing.
4. If review is approved, run `npm run tasks:set -- <task-dir> review=APPROVED`. If not, set
   `review=NEEDS_REVISION` and return the needed task-spec changes to the user.
5. Start an implementer subagent with the `task-implementer` skill. The implementer writes
   implementation files, tests, and `impl.md`, then commits the implementation change.
6. After the implementer finishes, read `impl.md` and report the implementation completion summary
   to the user before starting evaluation.
7. Start an evaluator subagent with the `impl-evaluator` skill. The evaluator writes only
   `eval.md` and optional `acceptance/` files.
8. After the evaluator finishes, read `eval.md` and report the evaluation completion summary to the
   user before deciding PASS / FAIL handling.
9. If evaluation fails, run `npm run tasks:set -- <task-dir> verdict=FAIL attempts=<n>` and send
   `eval.md` findings back to the implementer. Repeat within the user-approved iteration budget.
10. If evaluation passes, run `npm run tasks:set -- <task-dir> status=done verdict=PASS attempts=<n>`
   and the required task tooling checks.
11. Create the close commit containing review/eval/acceptance/meta/index changes. Include the task ID
   in the commit message.
12. Report the close completion summary to the user with the final status, commits, checks, and
   residual risks or follow-ups.

## Completion Reports

Parent Codex must give a short user-facing report whenever a role finishes. Do not wait until the
whole pipeline is closed to reveal subagent results.

Use the role artifact's summary section as the source of truth, then include:

- role and task ID
- verdict or status
- changed files or reviewed surface, when relevant
- checks run and their result
- checks not run and why
- residual risks, blockers, or next action

If a role artifact does not contain a usable summary, parent Codex must synthesize one from the
artifact before continuing and should note that the summary was synthesized.

## Ownership

| File or change                 | Owner                                |
| ------------------------------ | ------------------------------------ |
| `meta.yaml`                    | parent Codex only, via `tasks:set`   |
| category `index.md`            | parent Codex only, via `tasks:index` |
| `review.md`                    | reviewer                             |
| implementation files and tests | implementer                          |
| `impl.md`                      | implementer                          |
| implementation commit          | implementer                          |
| `eval.md`                      | evaluator                            |
| `acceptance/`                  | evaluator                            |
| close commit                   | parent Codex                         |

## Stop Conditions

- Stop before implementation when `review.md` is `NEEDS_REVISION`.
- Stop and ask the user when the task requires secrets, destructive operations, or broad scope
  changes not described in `task.md`.
- Stop after repeated evaluation failure when the user-approved attempt budget is exhausted.

## Required Checks

Choose checks from `tasks/README.md` according to the touched files. Always run task tooling checks
before close:

```sh
npm run tasks:index
npm run tasks:index:check
npm run tasks:check
```

When Markdown is touched, run:

```sh
cd sincromisor-frontend
npm run check:md
```
