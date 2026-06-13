# run-task-agents Customizations

This file records Sincromisor-specific differences from `/Users/aki/projects/run-task-agents`.
When refreshing the workflow kit, re-check each item before regenerating Codex artifacts.

## Task Metadata Compatibility

- Target files: `scripts/tasks/lib.mjs`, `scripts/tasks/setMeta.mjs`,
  `scripts/tasks/newTask.mjs`, `scripts/tasks/checkTasks.mjs`, existing `tasks/**/meta.yaml`
- Upstream difference: Sincromisor keeps `legacy_ids` while adding upstream `reviewed_sha`.
- Reason: migrated legacy task IDs and historical references must remain valid.
- Future refresh check: run `npm run tasks:check` and confirm both `legacy_ids` and
  `reviewed_sha` are validated.

## Existing Task Tooling

- Target files: `scripts/tasks/checkTasks.mjs`, `scripts/tasks/migrateLegacyTasks.mjs`,
  `package.json`
- Upstream difference: upstream does not include Sincromisor's `tasks:check` or
  `tasks:migrate:legacy`; both remain package scripts.
- Reason: the repository has migrated task history that still needs schema and legacy migration
  verification.
- Future refresh check: keep these scripts unless all legacy migration support is intentionally
  retired.

## Gate Steps

- Target file: `package.json`
- Upstream difference: `gateSteps` run frontend `check`, `build`, and `test` from
  `sincromisor-frontend`; Python-wide checks are not part of the cached default gate.
- Reason: frontend and Markdown checks are deterministic and cover the current agent workflow
  surface. Python full checks are heavier and should be selected per task when server code changes.
- Future refresh check: if server task volume increases, consider adding narrower Python gate steps
  or a separate server gate.

## Branch Prefix

- Target files: `AGENTS.md`, `tasks/README.md`, `.claude/commands/run-task.md`,
  `.claude/agents/task-implementer.md`
- Upstream difference: Sincromisor uses `codex/task-id` rather than upstream `task/task-id`.
- Reason: the Codex desktop environment uses the `codex/` prefix for assistant-owned branches.
- Future refresh check: keep the prefix aligned with repository and app-level Git guidance.

## Canonical Documentation Links

- Target files: `.claude/agents/*.md`, `.claude/commands/*.md`, `tasks/AUTHORING-CHECKLIST.md`,
  `AGENTS.md`, `tasks/README.md`
- Upstream difference: references point to `AGENTS.md`, `README.md`, `documents/design/`,
  `documents/rules/`, and `tasks/README.md`.
- Reason: those files are Sincromisor's canonical project, design, and coding-rule sources.
- Future refresh check: scan generated skills for stale generic documentation paths or multiple
  package manager examples.

## Generated Codex Artifacts

- Target files: `.agents/skills/**`, `.codex/agents/*.toml`, `.codex/hooks.json`
- Upstream difference: these are tracked generated artifacts derived from `.claude/`.
- Reason: Codex sessions need local skills and agent definitions without a separate generation step.
- Future refresh check: run `npm run gen:codex` and `npm run gen:codex:check` after editing
  `.claude/`.
