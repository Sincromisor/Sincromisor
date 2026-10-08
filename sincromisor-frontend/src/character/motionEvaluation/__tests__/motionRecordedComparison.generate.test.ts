/** 実写原本は任意の非公開入力。通常テストでは実行せず、明示した既存計算結果だけを集計する。 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { calculateFinalPoseMetrics } from "../motionFinalPoseMetrics";
import type { recomputeMotionReplay } from "../motionReplayComparison";

it.skipIf(process.env.SINCRO_RECORDED_COMPARISON !== "1")(
    "既存6動作の最終ボーン姿勢を同一時刻で集計する",
    () => {
        const root = resolve(import.meta.dirname, "../../../../..");
        const task = "task-261008235701-recorded-motion-quality-baseline";
        const artifacts = resolve(root, "tasks/character-sincro-motion", task, "artifacts");
        const privateRoot = resolve(root, "work/private-artifacts", task);
        const inventory = JSON.parse(
            readFileSync(resolve(artifacts, "recording-inventory.json"), "utf8"),
        );
        const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
        const results = inventory.recordings.map(
            (recording: {
                fixture: string;
                videoPath: string;
                videoSha256: string;
                replayPath: string;
                replaySha256: string;
            }) => {
                expect(sha256(readFileSync(resolve(root, recording.videoPath)))).toBe(
                    recording.videoSha256,
                );
                expect(sha256(readFileSync(resolve(root, recording.replayPath)))).toBe(
                    recording.replaySha256,
                );
                const labels = ["head", "candidate"];
                if (["hand-out-and-return", "fast-wave", "neutral-10s"].includes(recording.fixture))
                    labels.push("head-hands", "candidate-hands");
                if (recording.fixture === "hand-out-and-return")
                    labels.push(
                        "head-deleted",
                        "candidate-deleted",
                        "head-missing",
                        "candidate-missing",
                    );
                const conditions = labels.map((label) => {
                    const data = JSON.parse(
                        readFileSync(
                            resolve(privateRoot, `${label}-${recording.fixture}.json`),
                            "utf8",
                        ),
                    ) as ReturnType<typeof recomputeMotionReplay>;
                    const handData = label.includes("hands")
                        ? (JSON.parse(
                              readFileSync(
                                  resolve(
                                      privateRoot,
                                      `hand-observations-${recording.fixture}.json`,
                                  ),
                                  "utf8",
                              ),
                          ) as {
                              alignment: string;
                              observations: {
                                  mediaTimeMs: number;
                                  videoTimeMs: number;
                                  decodedVideoTimeMs: number;
                                  hand: { detected: boolean };
                              }[];
                          })
                        : undefined;
                    const times = data.samples.map((s) => s.mediaTimeMs);
                    const start = times[0] + 2000,
                        end = times.at(-1)!,
                        middle = (start + end) / 2;
                    return {
                        label,
                        source: data.source,
                        handSource: data.handSource,
                        outputSha256: sha256(
                            readFileSync(
                                resolve(privateRoot, `${label}-${recording.fixture}.json`),
                            ),
                        ),
                        handInput: handData && {
                            alignment: handData.alignment,
                            frames: handData.observations.length,
                            detectedFrames: handData.observations.filter((o) => o.hand.detected)
                                .length,
                            sha256: sha256(
                                readFileSync(
                                    resolve(
                                        privateRoot,
                                        `hand-observations-${recording.fixture}.json`,
                                    ),
                                ),
                            ),
                            maxSeekErrorMs: Math.max(
                                ...handData.observations.map((o) =>
                                    Math.abs(o.videoTimeMs - o.decodedVideoTimeMs),
                                ),
                            ),
                        },
                        config: data.config,
                        profile: data.profile,
                        frames: times.length,
                        processing: label.includes("deleted")
                            ? "先頭観測+4〜6秒のフレームを削除"
                            : label.includes("missing")
                              ? "先頭観測+4〜6秒のPose生結果を未検出へ置換"
                              : "なし",
                        temporalStates: count(
                            data.samples.flatMap((s) => [
                                s.temporal?.arms.left.state ?? "missing",
                                s.temporal?.arms.right.state ?? "missing",
                            ]),
                        ),
                        timestampSha256: sha256(JSON.stringify(times)),
                        firstTimeMs: times[0],
                        lastTimeMs: end,
                        torsoSources: count(
                            data.samples.map((s) => s.canonical?.torso.source ?? "missing"),
                        ),
                        reachClampedFrames: data.samples.filter((s) =>
                            [s.retarget.leftArm, s.retarget.rightArm].some(
                                (arm) => arm.reach && arm.reach.clampedBy !== "none",
                            ),
                        ).length,
                        elbowFlipReasons: count(
                            data.samples.flatMap((s) =>
                                [
                                    ...s.retarget.leftArm.constraint.reasons,
                                    ...s.retarget.rightArm.constraint.reasons,
                                ].filter((r) => r.includes("flip")),
                            ),
                        ),
                        metrics: (
                            [
                                "leftUpperArm",
                                "leftLowerArm",
                                "rightUpperArm",
                                "rightLowerArm",
                                ...(label.includes("hands")
                                    ? (["leftIndexProximal", "rightIndexProximal"] as const)
                                    : []),
                            ] as const
                        ).flatMap((bone) => {
                            const side = bone.startsWith("left") ? "left" : "right";
                            const samples = data.samples.map((s) => ({
                                mediaTimeMs: s.mediaTimeMs,
                                finalPose: s.finalPose.result?.finalPose ?? {},
                                inputAngleRad: bone.endsWith("Proximal")
                                    ? undefined
                                    : bone.endsWith("UpperArm")
                                      ? s.canonical?.arms[side].elevationRad
                                      : s.canonical?.arms[side].elbowFlexionRad,
                                recovering: s.temporal?.arms[side].state === "recovering",
                            }));
                            return [
                                { name: "調整", startMs: start, endMs: middle },
                                { name: "最終確認", startMs: middle, endMs: end },
                                ...(handData
                                    ? [
                                          {
                                              name: "Hand再推論",
                                              startMs: handData.observations[0].mediaTimeMs,
                                              endMs: handData.observations.at(-1)!.mediaTimeMs,
                                          },
                                      ]
                                    : []),
                                ...(label.includes("missing") || label.includes("deleted")
                                    ? [
                                          {
                                              name: "加工した欠損復帰",
                                              startMs: times[0] + 3500,
                                              endMs: times[0] + 8000,
                                          },
                                      ]
                                    : []),
                            ].map((segment) => ({
                                segment: segment.name,
                                inputFeature: bone.endsWith("Proximal")
                                    ? "なし（最終回転の揺れ・振幅だけを集計）"
                                    : bone.endsWith("UpperArm")
                                      ? "canonical.elevationRad"
                                      : "canonical.elbowFlexionRad",
                                ...calculateFinalPoseMetrics(samples, {
                                    bone,
                                    startMs: segment.startMs,
                                    endMs: segment.endMs,
                                    maxLagMs: (segment.endMs - segment.startMs) / 4,
                                }),
                            }));
                        }),
                    };
                });
                expect(conditions[0].timestampSha256).toBe(conditions[1].timestampSha256);
                return {
                    fixture: recording.fixture,
                    videoSha256: recording.videoSha256,
                    replaySha256: recording.replaySha256,
                    conditions,
                };
            },
        );
        const report = {
            schemaVersion: "sincro.recorded-motion-comparison.v1",
            head: process.env.SINCRO_COMPARISON_HEAD,
            candidate: "基準HEADに本結果と同じ実装コミットの変更を適用",
            inference: "保存済みPose/Face生結果を再利用。Hand再推論は別条件。",
            lagDefinition: "入力動作と出力回転の系列内遅れ。絶対表示遅延や人体の正解姿勢ではない。",
            generalization: "同一録画の前後区間を分離。人物・環境を変えた一般化は未評価。",
            vrm: {
                path: "sincromisor-frontend/public/characters/default.vrm",
                sha256: sha256(
                    readFileSync(
                        resolve(root, "sincromisor-frontend/public/characters/default.vrm"),
                    ),
                ),
            },
            recordedInference: {
                tasksVision: "0.10.34",
                modelHashes:
                    "元ログにはモデルのハッシュ無し。ローカルモデルとの同一性は未確認。Pose/Faceは保存済み生結果を固定。",
            },
            localModels: [
                "pose_landmarker_full.task",
                "face_landmarker.task",
                "hand_landmarker.task",
                "gesture_recognizer.task",
            ].map((name) => ({
                name,
                sha256: sha256(
                    readFileSync(resolve(root, "sincromisor-frontend/public/3rd_party", name)),
                ),
            })),
            results,
        };
        writeFileSync(
            resolve(artifacts, "comparison-summary.json"),
            `${JSON.stringify(report, null, 2)}\n`,
        );
    },
);
function count(values: string[]) {
    return values.reduce<Record<string, number>>((counts, value) => {
        counts[value] = (counts[value] ?? 0) + 1;
        return counts;
    }, {});
}
