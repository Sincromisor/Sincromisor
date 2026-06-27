# Implementation Log: task-260627141812-character-animation-3-phase-8-roi-contract-coordinate-mappin

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### Decision Notes

- `SincroRoiObservation` は task.md の最小 schema をそのまま正本にし、rect には source / confidence / warnings を入れず、JSON 保存可能な finite number / string enum / plain object / tuple だけで構成した。
- ROI warning は `SincroRoiWarningCode` として新設し、既存 `ReliabilityMap` は変更しなかった。ROI-to-reliability の写像は後続 task 境界として文書に明記した。
- `validateRoiRect()` は finite check、edge clip、min size check、confidence clamp の順で実装した。edge clip は left / top / right / bottom を `0..1` に clip してから center / size を再計算する方式にした。
- Missing wrist / missing face は throw せず `source: "none"`、`confidence: 0`、warning 付きの finite observation を返すようにした。
- v1 は axis-aligned ROI のみとし、rotation / palm basis / wrist roll は保存 contract に含めない方針を tracking / motion design docs に同期した。

### Commit

- `f0c7455` `feat(character): add phase 8 ROI coordinate contract`

### Verification

- PASS: `cd sincromisor-frontend && npm run test -- roiCoordinateMapping`
- PASS: `cd sincromisor-frontend && npm run test`
- PASS: `cd sincromisor-frontend && npm run build`
- PASS: `cd sincromisor-frontend && npm run check:biome`
- PASS: `./sincromisor-frontend/node_modules/.bin/prettier --config .prettierrc.json --ignore-path .prettierignore --check documents/design/frontend/character/tracking.md documents/design/frontend/character/motion.md`
- FAIL: `npm run gate`
    - `gate:lint` stopped in `npm run check:md`.
    - Reported files are pre-existing task documents outside this implementation scope:
      `tasks/character-sincro-motion/task-260626014933-character-animation-3-phase-7-debug-replay-docs-integration/review.md`,
      `task-260627141812-character-animation-3-phase-8-pose-seeded-hand-roi-tracking/{task.md,review.md}`,
      `task-260627141812-character-animation-3-phase-8-roi-contract-coordinate-mappin/{task.md,review.md}`,
      `task-260627141813-character-animation-3-phase-8-roi-cadence-fallback-docs/{task.md,review.md}`,
      `task-260627141813-character-animation-3-phase-8-roi-reliability-debug-replay/{task.md,review.md}`.
    - The current task `task.md` is immutable by instruction, so I did not run Prettier over task state files to force the gate green.

### Residual Risk

- Implementation commit exists, but the branch must not be treated as fully complete until the repository-level Markdown gate blocker is resolved or the orchestrator explicitly permits formatting the listed task state files.

### Orchestrator Follow-up

- The repository-level Markdown gate blocker was resolved with a Prettier-only commit:
  `29e7601` `chore(tasks): format phase 8 task documents`.
- PASS: `npm run gate` on clean implementation HEAD `29e7601`.
- The formatting commit only adjusts task / review Markdown formatting required by the gate and does not change task semantics.
