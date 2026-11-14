import { expect, it } from "vitest";
import { DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT } from "../sincroFaceMotionSnapshot";
import {
    cloneFaceMotionSnapshot,
    clonePipelineFaceMotionSnapshot,
    createDefaultFaceMotionSnapshot,
} from "../sincroFaceMotionSnapshotClone";

it("既定値を独立して生成し、欠損した時刻だけを補完する", () => {
    const snapshot = createDefaultFaceMotionSnapshot();
    expect(snapshot).toEqual(cloneFaceMotionSnapshot(DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT));
    snapshot.warnings.push("changed");
    snapshot.blendshapes.jawOpen = 1;
    snapshot.headPose.yawDeg = 90;
    expect(createDefaultFaceMotionSnapshot().warnings).toEqual([]);
    expect(createDefaultFaceMotionSnapshot().blendshapes).toEqual({});
    expect(createDefaultFaceMotionSnapshot().headPose.yawDeg).toBe(0);
    expect(cloneFaceMotionSnapshot(snapshot).lastUpdatedAtMs).toBeUndefined();
    expect(cloneFaceMotionSnapshot(snapshot, 42).lastUpdatedAtMs).toBe(42);
    snapshot.lastUpdatedAtMs = 0;
    expect(cloneFaceMotionSnapshot(snapshot, 42).lastUpdatedAtMs).toBe(0);
});

it("表情・警告・領域は複製し、頭部行列の共有は行動表示用だけに残す", () => {
    const snapshot = createDefaultFaceMotionSnapshot();
    snapshot.headPose.matrix = [1, 2, 3];
    snapshot.roi = {
        side: "face",
        source: "pose-face",
        rect: { centerX: 0.5, centerY: 0.5, width: 0.2, height: 0.3, clamped: false },
        confidence: 1,
        referencePoint: [0.5, 0.5],
        warnings: ["roi_clamped"],
    };
    const behavior = cloneFaceMotionSnapshot(snapshot);
    const pipeline = clonePipelineFaceMotionSnapshot(snapshot);
    for (const clone of [behavior, pipeline]) {
        expect(clone).toEqual(snapshot);
        expect(clone.headPose).not.toBe(snapshot.headPose);
        expect(clone.blendshapes).not.toBe(snapshot.blendshapes);
        expect(clone.warnings).not.toBe(snapshot.warnings);
        expect(clone.roi).not.toBe(snapshot.roi);
        expect(clone.roi?.rect).not.toBe(snapshot.roi.rect);
        expect(clone.roi?.referencePoint).not.toBe(snapshot.roi.referencePoint);
        expect(clone.roi?.warnings).not.toBe(snapshot.roi.warnings);
    }
    expect(behavior.headPose.matrix).toBe(snapshot.headPose.matrix);
    snapshot.headPose.matrix.push(4);
    expect(pipeline.headPose.matrix).toEqual([1, 2, 3]);
    expect(
        clonePipelineFaceMotionSnapshot(createDefaultFaceMotionSnapshot()).headPose.matrix,
    ).toBeUndefined();
});
