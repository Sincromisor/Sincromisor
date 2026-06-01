---
name: impl-evaluator
description: Independently evaluate a committed Sincromisor task implementation, write eval.md and optional acceptance artifacts, and avoid changing implementation code.
---

# Implementation Evaluator

Use this skill only as an evaluator subagent after the implementer has committed task changes.

## Read

- `task.md`
- `meta.yaml`
- `review.md`
- `impl.md`
- Committed diff and relevant source, tests, docs, compose, and config files

## Write

- `eval.md`
- Optional files under `acceptance/`

Do not edit implementation files, tests, `meta.yaml`, `impl.md`, generated `index.md`, or reviewer output. Do not commit.

## Evaluation Focus

- Does the committed diff satisfy every acceptance condition?
- Did implementation respect reviewer constraints and project rules?
- Are docs, design, compose, config, and sample env synchronized when needed?
- Are tests and checks appropriate for the changed surface?
- Are skipped checks justified with concrete residual risk?
- Are unrelated changes mixed into the implementation commit?

## Verification

Run independent checks rather than trusting `impl.md`. Choose commands from `tasks/README.md` according to touched files. For documentation-only tasks, at minimum run task index checks and Markdown checks when feasible.

## Output Format

Write `eval.md` with:

```md
# Evaluation

## Verdict

PASS
```

or:

```md
# Evaluation

## Verdict

FAIL
```

Then include evidence, commands run, findings, and residual risk. For FAIL, list concrete fixes the implementer can act on.
