# P0 Real Video Capture (2026-07-12)

## Environment

- Capture device: MacBook Air M1 front camera
- Source: user-captured and manually trimmed QuickTime MOV
- Browser input: macOS `avconvert` derived H.264 720p MP4-compatible files
- Runtime: Chrome, `motion-debug`, debug performance profile
- Production implementation SHA: `3b5cfa81`
- Pose-snapshot baseline SHA: `56834af984a381fab1842bb24cc7724e7eba1c9f`

The original and trimmed MOV files remain unchanged. Browser-compatible derivatives are evaluation transport only.

## Captured Fixtures

| Fixture                 | Trimmed duration | Temporal-build frames | Baseline frames |
| ----------------------- | ---------------: | --------------------: | --------------: |
| `neutral-10s`           |          12.84 s |                   110 |             102 |
| `single-arm-slow-raise` |          11.92 s |                    92 |              91 |
| `both-arms-slow-raise`  |          13.42 s |                   101 |             107 |
| `hand-out-and-return`   |          11.10 s |                    89 |              87 |
| `arms-cross`            |          13.19 s |                   134 |             138 |
| `fast-wave`             |          12.06 s |                    84 |              80 |

Pose detection succeeded for all fixtures. The neutral verification sample reported confidence `0.9991`, Pose inference approximately `9.9 fps`, and zero tracker dropped frames before recording.

## Blocking Finding

The implementation build did not produce temporal-primary solver frames. Every recorded arm frame in all six fixtures reported:

```text
primarySource: pose-snapshot-fallback
fallbackReason: temporal_input_missing
bridgeReasonCodes: [temporal_input_missing]
```

Therefore, files initially generated under a temporal-primary label were renamed to `*.temporal-build-fallback-observed.*`. They are diagnostic evidence and must not be treated as temporal-primary comparison results.

The baseline recordings are preserved as `*.pose-snapshot-fallback.ndjson`. A temporal-primary versus pose-snapshot-fallback regression verdict cannot be calculated until the `motion-debug` video-fixture pipeline passes its computed `TemporalUpperBodyState` into the production retarget runtime boundary.

## Required Follow-up

1. Connect the `motion-debug` fixture runtime's temporal state to the same runtime input boundary used by production `VRMCharacterManager.update()`.
2. Add an integration test that records or inspects a valid fixture frame and requires Phase 6 `source.primarySource` to be `temporal` when temporal/profile/solver inputs are valid.
3. Re-run the six real-video fixtures.
4. Only then compare neutral jitter, elbow flip count, recovery jump, and reach clamp occupancy against the saved pose-snapshot fallback recordings.

## Follow-up Result

Commit `ff0edef9` connected the live motion-debug temporal state to `CharacterBehaviorState`. After the fix, all 595 candidate frames reported `primarySource: temporal` for both arms and no candidate frame used Pose fallback.

The resulting real-video comparison is saved in `p0-temporal-vs-pose-fallback-metrics-comparison.real-video.json`. The comparison verdict remains `FAIL`: Phase 6 elbow-pole flip rejection increased from baseline values of 0–2 to 117–196 per fixture, and `arms-cross` reach clamp occupancy increased from approximately `0.649` to `0.867`. No recovering temporal samples were captured, so recovery jump remains not comparable.

Commit `3b5cfa81` then stabilized temporal elbow-pole history. The final capture contains 610 frames (1220 arm samples), all temporal-primary. Elbow flip rejects are baseline-or-better on five fixtures and only one reject remains in `arms-cross`; neutral jitter improved from `0.024490` to `0.023117`. The comparison remains `FAIL` because `arms-cross` reach clamp occupancy is `0.873134` versus baseline `0.648551`, its single elbow reject exceeds baseline zero, and no recovery event was present for recovery-jump comparison.

## Privacy

The replay logs contain derived tracking and solver data. Raw camera device identifiers, group identifiers, and labels are not stored. Source video and browser-compatible derivatives remain untracked and must not be committed without explicit approval.
