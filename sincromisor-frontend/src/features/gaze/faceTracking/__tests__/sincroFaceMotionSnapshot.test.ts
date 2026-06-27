import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { describe, expect, it } from "vitest";
import {
    DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
    type SincroPoseMotionSnapshot,
} from "../../poseTracking/sincroPoseMotionSnapshot";
import { cloneSincroPoseMotionSnapshot } from "../../poseTracking/sincroPoseMotionSnapshotClone";
import type { SincroRoiObservation } from "../../trackingRuntime/roiTracking/roiTrackingTypes";
import {
    type SincroFaceLandmarkerLike,
    type SincroFaceRoiCropFactory,
    SincroFaceTracker,
} from "../sincroFaceTracker";

const TEST_VIDEO_FRAME: ImageData = {
    colorSpace: "srgb",
    data: new Uint8ClampedArray(16),
    height: 2,
    width: 2,
};

const TEST_CROP_FRAME: ImageData = {
    colorSpace: "srgb",
    data: new Uint8ClampedArray(16),
    height: 2,
    width: 2,
};

class FakeFaceLandmarker implements SincroFaceLandmarkerLike {
    readonly frames: TexImageSource[] = [];
    private readonly results: FaceLandmarkerResult[];

    constructor(results: FaceLandmarkerResult[]) {
        this.results = results;
    }

    detectForVideo(videoFrame: TexImageSource, _timestampMs: number): FaceLandmarkerResult {
        this.frames.push(videoFrame);
        return this.results[this.frames.length - 1] ?? createNoFaceResult();
    }

    close(): void {}
}

function createTracker(input: {
    results: FaceLandmarkerResult[];
    cropFactory?: SincroFaceRoiCropFactory;
}): { tracker: SincroFaceTracker; landmarker: FakeFaceLandmarker } {
    const landmarker = new FakeFaceLandmarker(input.results);
    const tracker = new SincroFaceTracker({
        faceLandmarker: landmarker,
        createCropFrame:
            input.cropFactory ??
            (() => {
                return TEST_CROP_FRAME;
            }),
    });
    return { tracker, landmarker };
}

function createDetectedResult(point: readonly [number, number] = [0.5, 0.5]): FaceLandmarkerResult {
    return {
        faceLandmarks: [
            [
                {
                    x: point[0],
                    y: point[1],
                    z: 0,
                    visibility: 1,
                },
            ],
        ],
        faceBlendshapes: [
            {
                categories: [
                    {
                        categoryName: "mouthSmileLeft",
                        displayName: "",
                        index: 0,
                        score: 0.82,
                    },
                ],
                headIndex: 0,
                headName: "",
            },
        ],
        facialTransformationMatrixes: [],
    };
}

function createNoFaceResult(): FaceLandmarkerResult {
    return {
        faceLandmarks: [],
        faceBlendshapes: [],
        facialTransformationMatrixes: [],
    };
}

function createPose(
    input: {
        detected?: boolean;
        shoulderWidth?: number;
        shoulderCenterX?: number;
        shoulderCenterY?: number;
    } = {},
): SincroPoseMotionSnapshot {
    return cloneSincroPoseMotionSnapshot({
        ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
        trackingEnabled: true,
        detected: input.detected ?? true,
        confidence: 0.86,
        upperBody: {
            ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT.upperBody,
            shoulderWidth: input.shoulderWidth ?? 0.2,
            shoulderCenterX: input.shoulderCenterX ?? 0.5,
            shoulderCenterY: input.shoulderCenterY ?? 0.4,
        },
    });
}

function expectFaceRoi(roi: SincroRoiObservation | undefined): SincroRoiObservation {
    expect(roi).toBeDefined();
    if (roi === undefined) {
        throw new Error("ROI observation is missing.");
    }
    expect(roi.side).toBe("face");
    return roi;
}

describe("SincroFaceTracker ROI snapshots", () => {
    it("keeps full-frame detect compatible while adding default metadata", () => {
        const { tracker, landmarker } = createTracker({
            results: [createDetectedResult()],
        });

        const snapshot = tracker.detect(TEST_VIDEO_FRAME, 1000);

        expect(snapshot.detected).toBe(true);
        expect(snapshot.source).toBe("full-frame");
        expect(snapshot.roi).toBeUndefined();
        expect(snapshot.warnings).toEqual([]);
        expect(snapshot.confidence).toBeCloseTo(0.82);
        expect(landmarker.frames).toEqual([TEST_VIDEO_FRAME]);
    });

    it("uses a valid pose face ROI without storing crop-local raw landmarks", () => {
        const { tracker, landmarker } = createTracker({
            results: [createDetectedResult()],
        });

        const snapshot = tracker.detectWithRoi(TEST_VIDEO_FRAME, createPose(), 1000);

        expect(snapshot.detected).toBe(true);
        expect(snapshot.source).toBe("roi");
        expect(snapshot.warnings).toEqual([]);
        const roi = expectFaceRoi(snapshot.roi);
        expect(roi.source).toBe("pose-face");
        expect(roi.rect.centerX).toBeCloseTo(0.5);
        expect(roi.rect.centerY).toBeCloseTo(0.22);
        expect(landmarker.frames).toEqual([TEST_CROP_FRAME]);
    });

    it("falls back to full-frame when the pose face ROI is invalid", () => {
        const { tracker, landmarker } = createTracker({
            results: [createDetectedResult()],
        });

        const snapshot = tracker.detectWithRoi(
            TEST_VIDEO_FRAME,
            createPose({ detected: false }),
            1000,
        );

        expect(snapshot.detected).toBe(true);
        expect(snapshot.source).toBe("full-frame-fallback");
        expect(snapshot.warnings).toEqual(["roi_missing", "pose_not_detected"]);
        expect(expectFaceRoi(snapshot.roi).source).toBe("none");
        expect(landmarker.frames).toEqual([TEST_VIDEO_FRAME]);
    });

    it("runs one full-frame fallback when ROI inference finds no face", () => {
        const { tracker, landmarker } = createTracker({
            results: [createNoFaceResult(), createDetectedResult()],
        });

        const snapshot = tracker.detectWithRoi(TEST_VIDEO_FRAME, createPose(), 1000);

        expect(snapshot.detected).toBe(true);
        expect(snapshot.source).toBe("full-frame-fallback");
        expect(snapshot.warnings).toEqual(["roi_missing"]);
        expect(landmarker.frames).toEqual([TEST_CROP_FRAME, TEST_VIDEO_FRAME]);
    });

    it("marks lost when ROI and full-frame fallback both find no face", () => {
        const { tracker, landmarker } = createTracker({
            results: [createNoFaceResult(), createNoFaceResult()],
        });

        const snapshot = tracker.detectWithRoi(TEST_VIDEO_FRAME, createPose(), 1000);

        expect(snapshot.detected).toBe(false);
        expect(snapshot.source).toBe("lost");
        expect(snapshot.fallbackReason).toBe("face_not_detected");
        expect(snapshot.warnings).toEqual(["roi_missing"]);
        expect(landmarker.frames).toEqual([TEST_CROP_FRAME, TEST_VIDEO_FRAME]);
    });

    it("switches to full-frame fallback when ROI consistency score is zero", () => {
        const { tracker, landmarker } = createTracker({
            results: [createDetectedResult([1, 1]), createDetectedResult()],
        });

        const snapshot = tracker.detectWithRoi(TEST_VIDEO_FRAME, createPose(), 1000);

        expect(snapshot.detected).toBe(true);
        expect(snapshot.source).toBe("full-frame-fallback");
        expect(snapshot.warnings).toEqual(["roi_inconsistent"]);
        expect(landmarker.frames).toEqual([TEST_CROP_FRAME, TEST_VIDEO_FRAME]);
    });

    it("deep clones ROI and warnings from getSnapshot and resets stop metadata", () => {
        const { tracker } = createTracker({
            results: [createDetectedResult()],
        });
        tracker.detectWithRoi(TEST_VIDEO_FRAME, createPose(), 1000);

        const cloned = tracker.getSnapshot();
        cloned.warnings.push("mutated");
        const clonedRoi = expectFaceRoi(cloned.roi);
        clonedRoi.rect.centerX = 0;

        const fresh = tracker.getSnapshot();
        expect(fresh.warnings).toEqual([]);
        expect(expectFaceRoi(fresh.roi).rect.centerX).toBeCloseTo(0.5);

        const stopped = tracker.stop("test_stop", 2000);
        expect(stopped.detected).toBe(false);
        expect(stopped.source).toBe("lost");
        expect(stopped.roi).toBeUndefined();
        expect(stopped.warnings).toEqual([]);
        expect(stopped.fallbackReason).toBe("test_stop");
    });
});
