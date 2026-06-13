# Review

## Verdict

APPROVED

## Summary for Parent

Verdict: APPROVED. The task is broad but implementable: it names the upstream source, the Sincromisor-specific compatibility requirements, concrete affected files, acceptance criteria, and verification commands. No task-spec changes are required before implementation. Main implementation risks are preserving `legacy_ids` while adding `reviewed_sha`, keeping `.claude/` as the single source for generated Codex artifacts, and not accidentally staging unrelated untracked `DESIGN.md` / `MEMO.md`.

## Findings

- No blocking task-spec issues found.
- The acceptance criteria are testable and include both generation drift checks and task tooling compatibility checks.
- The task explicitly identifies Sincromisor customizations that must remain: `legacy_ids`, `tasks:check`, `tasks:migrate:legacy`, project-specific canonical docs, and project-specific gate command choices.
- The task calls out unrelated untracked files that must not be included in implementation commits.

## Required Changes

- None.

## Recommended Checks

- `npm run tasks:check`
- `npm run tasks:index`
- `npm run tasks:index:check`
- `npm run gen:codex`
- `npm run gen:codex:check`
- `npm run tasks:next -- --json`
- `npm run tasks:close -- --dry-run <test-task-dir> verdict=PASS attempts=1`
- `npm run gate`
- `cd sincromisor-frontend && npm run check:md`

## Implementation Notes

- Prefer importing upstream files from `/Users/aki/projects/run-task-agents` mechanically, then applying Sincromisor-specific edits in a small number of places.
- `scripts/tasks/lib.mjs`, `scripts/tasks/setMeta.mjs`, `scripts/tasks/newTask.mjs`, and `scripts/tasks/checkTasks.mjs` must preserve `legacy_ids` while adding `reviewed_sha`.
- If the upstream `yaml` dependency is introduced, update `package.json` and create or update the npm lockfile as part of the implementation.
- Gate commands should be useful but not overly heavy for this mixed Python / frontend repository; any intentionally excluded heavy checks should be documented in the customization record and implementation log.
