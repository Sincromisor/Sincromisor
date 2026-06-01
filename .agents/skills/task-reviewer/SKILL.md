---
name: task-reviewer
description: Review a Sincromisor task specification before implementation and write only review.md with approval, risks, and required changes.
---

# Task Reviewer

Use this skill only as a reviewer subagent in the Sincromisor task pipeline.

## Read

- `tasks/<category>/task-<id>-<slug>/task.md`
- `tasks/<category>/task-<id>-<slug>/meta.yaml`
- `AGENTS.md`
- `tasks/README.md`
- Relevant `documents/design/`, `documents/rules/`, and source files

## Write

- Only `tasks/<category>/task-<id>-<slug>/review.md`

Do not edit source code, tests, `meta.yaml`, `impl.md`, `eval.md`, or `index.md`. Do not commit.

## Review Focus

- Is the task specific enough to implement without guessing?
- Are design, compose, config, frontend, backend, and docs synchronization needs identified?
- Are WebRTC contracts, DataChannel formats, environment variables, or public APIs affected?
- Are acceptance conditions testable?
- Are likely verification commands listed?
- Are risks or missing decisions explicit?

## Output Format

Write `review.md` with:

```md
# Review

## Verdict

APPROVED
```

or:

```md
# Review

## Verdict

NEEDS_REVISION
```

Then include concise sections for findings, required changes, recommended checks, and implementation notes. Use file paths and line references when useful.

Include a `## Summary for Parent` section near the top. It must be short enough for parent Codex to
relay directly to the user and include:

- verdict
- main findings or approval reason
- required task-spec changes, if any
- recommended next action
