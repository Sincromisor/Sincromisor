import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { expect, it } from "vitest";
import { SincroFaceRetargeter } from "../../../../character/retargeting/sincroFaceRetargeter";
import { normalizeSincroFaceLandmarkerResult } from "../sincroFaceTrackerNormalizer";

function result(score = 0.01, yaw = 0): FaceLandmarkerResult {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return {
        faceLandmarks: [[{ x: 0.5, y: 0.5, z: 0, visibility: 1 }]],
        faceBlendshapes: [
            {
                categories: [{ categoryName: "jawOpen", displayName: "", index: 0, score }],
                headIndex: 0,
                headName: "",
            },
        ],
        facialTransformationMatrixes: [
            { rows: 4, columns: 4, data: [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1] },
        ],
    };
}
function normalize(value: FaceLandmarkerResult) {
    return normalizeSincroFaceLandmarkerResult({
        result: value,
        inferenceTimeMs: 1,
        inferenceFps: 15,
        nowMs: 0,
        source: "full-frame",
        warnings: [],
    });
}

it("無表情と強い表情で入力の有効性が変わらない", () => {
    for (const score of [0, 0.01, 0.9]) {
        const snapshot = normalize(result(score));
        expect(snapshot.confidence).toBe(1);
        expect(snapshot.blendshapes.jawOpen).toBe(score);
        expect(new SincroFaceRetargeter().retarget(snapshot, 0).active).toBe(true);
    }
});

it("無表情で較正を保ち、頭を動かしたときに追従し、追跡喪失時に停止する", () => {
    const retargeter = new SincroFaceRetargeter({ neutralLearningMs: 100 });
    retargeter.retarget(normalize(result()), 0);
    retargeter.retarget(normalize(result()), 200);
    const moved = retargeter.retarget(normalize(result(0, 0.4)), 300);
    expect(moved.active).toBe(true);
    expect(Math.abs(moved.head.head.y)).toBeGreaterThan(0);
    expect(retargeter.retarget(normalize({ ...result(), faceLandmarks: [] }), 400).active).toBe(
        false,
    );
});

it("空の検出と不正座標・行列を下流へ渡さない", () => {
    const invalidCoordinate = result();
    invalidCoordinate.faceLandmarks[0][0].x = Number.NaN;
    const invalidMatrix = result();
    invalidMatrix.facialTransformationMatrixes[0].data[0] = Infinity;
    const shortMatrix = result();
    shortMatrix.facialTransformationMatrixes[0].data = [1];
    for (const value of [
        { ...result(), faceLandmarks: [[]] },
        invalidCoordinate,
        invalidMatrix,
        shortMatrix,
    ]) {
        const snapshot = normalize(value);
        expect(snapshot.detected).toBe(false);
        expect(snapshot.confidence).toBe(0);
        expect(new SincroFaceRetargeter().retarget(snapshot, 0).active).toBe(false);
    }
});

it("行列省略時も表情観測を維持し、頭部は中立値にする", () => {
    const snapshot = normalize({ ...result(), facialTransformationMatrixes: [] });
    expect(snapshot.confidence).toBe(1);
    expect(snapshot.headPose).toEqual({ yawDeg: 0, pitchDeg: 0, rollDeg: 0 });
});
