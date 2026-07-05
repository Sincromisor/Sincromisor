# P0 Replay Fixture Search - Attempt 2

## Scope

This log records the repository search requested after evaluation FAIL. The goal was
to determine whether the repository already contains a canonical P0 production
replay fixture that can be used for a temporal-primary versus pose-snapshot-fallback
metrics comparison.

## Commands

Run from the implementation worktree:

```sh
find /var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-cc415b27024e-A9HaHw \
  -path '*/node_modules' -prune -o \
  -path '*/dist' -prune -o \
  -path '*/.git' -prune -o \
  \( -name '*.ndjson' -o -name '*.jsonl' -o -name '*.jsonl.gz' -o -name '*.ndjson.gz' -o -name '*.log' -o -name '*.json' \) \
  -print

rg -n "recordType|sincro.motion-debug-log|motion-debug|motion-qa-fixture-manifest|fixtureId|neutral-10s|single-arm-slow-raise|both-arms-slow-raise|hand-out-and-return|arms-cross|fast-wave" \
  /var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-cc415b27024e-A9HaHw

rg --files /var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-cc415b27024e-A9HaHw/tasks/character-sincro-motion \
  | rg 'neutral-10s|single-arm|both-arms|hand-out|arms-cross|fast-wave|motion-debug|replay|baseline|fixture|recording|summary'
```

## Candidate Results

- `tasks/character-sincro-motion/task-260629225919-production-sincro-motion-replay-baselines/artifacts/production-sincro-baseline-manifest.md`
    - This is the canonical P0 index, but it explicitly marks every P0 fixture as
      `source: not-captured` and states that replay logs and metrics summaries must
      not be treated as real-camera evidence.
- `tasks/character-sincro-motion/task-260629225942-production-retarget-composer-motion-metrics-comparison/artifacts/composer-comparison/production-composer-comparison-summaries.not-captured.json`
    - Contains `neutral-10s`, `single-arm-slow-raise`, `both-arms-slow-raise`,
      `hand-out-and-return`, `arms-cross`, and `fast-wave`, but every metric is
      `not_available` with `unavailableReason: "baseline_not_captured"`.
- `tasks/character-sincro-motion/task-260705004405-torso-shoulder-composer-migration/artifacts/torso-shoulder-composer-migration-replay.json`
    - Synthetic torso/shoulder migration replay. It does not contain production
      motion-debug frames, P0 arm fixture ids, or the arm metrics required by this task.
- `sincromisor-frontend/src/character/motionMetrics/__tests__/motionQaRegressionTestFixtures.ts`
    - Synthetic QA fixtures for unit/regression tests. These are not captured
      production replay artifacts.
- `tasks/character-sincro-motion/task-3116-sincro-pose-ik-observability-verification-and-design-sync/artifacts/*.json`
    - Historical Playwright/camera summary files. They do not contain replay frames
      suitable for temporal-primary versus pose-fallback metrics comparison.

No committed `.ndjson`, `.ndjson.gz`, `.jsonl`, or `.jsonl.gz` production replay
artifact matching the P0 fixture ids was found in the repository.

## Required Artifact Format

The existing baseline manifest defines the expected real-capture layout:

- Replay log: `artifacts/replay/<metrics-fixture-id>.ndjson`
- Optional compressed replay log: `artifacts/replay/<metrics-fixture-id>.ndjson.gz`
- Metrics summary: `artifacts/metrics/<metrics-fixture-id>.summary.json`
- Optional baseline wrapper: `artifacts/metrics/<metrics-fixture-id>.baseline.json`

For this task's comparison, each replay must include enough production
`simple-vrm` / `sincro` frames to compute neutral jitter, elbow flip count,
recovery jump, and reach clamp occupancy for both temporal-primary and
pose-snapshot-fallback runs.

## Conclusion

The repository does not contain a canonical captured P0 replay fixture that can
support the required metrics comparison. The attempt-1 synthetic comparison remains
useful as a unit-level smoke artifact, but it cannot satisfy the P0 replay fixture
condition because the evaluator requires a real repository fixture / recording /
replay artifact. Completing that acceptance item requires manual or real-device
capture of the six P0 motions and metrics generation from those captured logs.
