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

Use the same checkout by default. Before evaluating, confirm there is no uncommitted implementation
diff left from the implementer. A physical `git worktree` is optional and should be used only when
the parent requests stronger isolation or the existing checkout has conflicting dirty changes.

Run verification-only commands. Do not use `--fix`, `--write`, formatter write mode, or any command
that rewrites implementation files. If a normal project command would mutate files, choose the
check-only variant or record why it was not run.

The 3 point gate is:

- lint / format check
- type check or build
- tests that cover the acceptance conditions

Evaluate test adequacy, not only command success. A passing test run with missing acceptance coverage
can still be a FAIL.

## Acceptance Artifacts

Additional evaluator-created checks, notes, screenshots, or fixtures must stay under `acceptance/`.
Do not modify implementation code, implementation tests, task metadata, `impl.md`, or generated
indexes. Do not commit evaluator artifacts; the parent Codex owns the close commit.

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

Include a `## Completion Summary` section near the top. It must be short enough for parent Codex to
relay directly to the user and include:

- verdict
- evidence for PASS, or concrete blocking findings for FAIL
- independent checks run and their results
- checks not run and why
- residual risks or next action
