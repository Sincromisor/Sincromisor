import type { HandLandmarkerResult } from "@mediapipe/tasks-vision";
import { expect, it } from "vitest";
import type { SincroRoiObservation } from "../../trackingRuntime/roiTracking/roiTrackingTypes";
import { assignSincroHandObservationsToPose } from "../sincroHandAssignment";
import { DEFAULT_SINCRO_HAND_FEATURE_SNAPSHOT } from "../sincroHandMotionSnapshot";
import { normalizeSincroHandLandmarkerResult } from "../sincroHandNormalization";

// zを持つ同じ合成形状を、異なる画角の画像へ投影する。推論精度ではなく座標の扱いを検証する。
function sample(aspect: number, roi?: SincroRoiObservation): HandLandmarkerResult {
    const world = Array.from({ length: 21 }, (_, i) => ({
        x: ((i % 4) - 1) * 0.015,
        y: -Math.floor(i / 4) * 0.02,
        z: (i % 3) * 0.01,
        visibility: 1,
    }));
    world[0] = { x: 0, y: 0, z: 0, visibility: 1 };
    const rect = roi?.rect ?? { centerX: 0.5, centerY: 0.5, width: 1, height: 1 };
    return {
        worldLandmarks: [world],
        landmarks: [
            world.map((p) => ({
                x: (0.4 + p.x - rect.centerX) / rect.width + 0.5,
                y: (0.5 + p.y * aspect - rect.centerY) / rect.height + 0.5,
                z: p.z / rect.width,
                visibility: 1,
            })),
        ],
        handedness: [[{ categoryName: "Left", displayName: "", index: 0, score: 0.9 }]],
        handednesses: [],
    };
}

it("同じ手の形状と左右割当はROI幅・高さと映像の縦横比で変わらない", () => {
    const baseline = normalizeSincroHandLandmarkerResult({ result: sample(1) })[0];
    for (const aspect of [1, 16 / 9, 9 / 16]) {
        for (const width of [0.2, 0.6, 1]) {
            const roi: SincroRoiObservation = {
                side: "left",
                source: "pose-wrist",
                confidence: 1,
                warnings: [],
                rect: { centerX: 0.4, centerY: 0.5, width, height: width * 0.8, clamped: false },
            };
            const observations = normalizeSincroHandLandmarkerResult({
                result: sample(aspect, roi),
                roi,
            });
            expect(observations[0].features).toEqual(baseline.features);
            expect(observations[0].wrist).toEqual(baseline.wrist);
            const assignment = assignSincroHandObservationsToPose({
                observations,
                source: "roi",
                leftWrist: { side: "left", point: [0.4, 0.5], confidence: 1 },
                rightWrist: { side: "right", point: [0.8, 0.5], confidence: 1 },
            });
            expect(assignment.leftHand.detected).toBe(true);
            expect(assignment.rightHand.detected).toBe(false);
            expect(assignment.leftHand.features).toEqual(baseline.features);
        }
    }
});

it("3D観測の欠損・点数不足・非有限・退化は画像座標で補わない", () => {
    const original = sample(1);
    const invalid = structuredClone(original.worldLandmarks[0]);
    invalid[5].z = NaN;
    const degenerate = original.worldLandmarks[0].map(() => ({ x: 0, y: 0, z: 0, visibility: 1 }));
    for (const world of [[], original.worldLandmarks[0].slice(0, 20), invalid, degenerate]) {
        const observation = normalizeSincroHandLandmarkerResult({
            result: { ...original, worldLandmarks: [world] },
        })[0];
        expect(observation.warnings).toContain("landmarks_missing");
        expect(observation.features).toEqual(DEFAULT_SINCRO_HAND_FEATURE_SNAPSHOT);
        expect(observation.wrist).toEqual([0.4, 0.5]);
    }
});
