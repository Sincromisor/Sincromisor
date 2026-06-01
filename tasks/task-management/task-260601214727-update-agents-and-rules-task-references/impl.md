# Implementation Log

## Attempt 1

- Updated `AGENTS.md` to point at `tasks/README.md`, `tasks/<category>/task-<id>-<slug>/`, `meta.yaml`, and task-management checks.
- Updated `.github/copilot-instructions.md` with links to `AGENTS.md` and `tasks/README.md`, plus current frontend stack wording.
- Updated Markdown, TypeScript, and Python coding rules to prefer canonical `task-<id>-<slug>` TODO references while preserving legacy `TASK-...` compatibility.
- Updated design documentation entrypoints and one current ADR reference to use the migrated task paths.

## Verification

- `rg "documents/tasks|tasks/README|open/|done/" AGENTS.md .github/copilot-instructions.md documents/rules documents/design -g '*.md'`
- `env TASKS_DOCS_DIRS=documents/rules,documents/design,.github npm run tasks:fixlinks`
- `npm run tasks:index:check`
- `npm run tasks:check`
- `npm run check:md` from `sincromisor-frontend`

## Not Run

- Full frontend / Python / compose checks were not run because this task only changes Markdown documentation.
