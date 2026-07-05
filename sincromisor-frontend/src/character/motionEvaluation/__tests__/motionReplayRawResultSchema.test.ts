import { describe, expect, it } from "vitest";

import { parseMotionReplayRawResultFrame } from "../motionReplayRawResultSchema";

function createCategory() {
    return {
        score: 0.9,
        index: 0,
        categoryName: "Open_Palm",
        displayName: "",
    };
}

function createLandmark() {
    return {
        x: 0.5,
        y: 0.4,
        z: -0.1,
        visibility: 0.8,
    };
}

describe("parseMotionReplayRawResultFrame", () => {
    it("accepts plain JSON raw result slots with timing", () => {
        const result = parseMotionReplayRawResultFrame({
            pose: {
                landmarks: [[createLandmark()]],
                worldLandmarks: [[createLandmark()]],
            },
            hand: {
                landmarks: [[createLandmark()]],
                worldLandmarks: [[createLandmark()]],
                handedness: [[createCategory()]],
                handednesses: [[createCategory()]],
            },
            face: {
                faceLandmarks: [[createLandmark()]],
                faceBlendshapes: [
                    {
                        categories: [createCategory()],
                        headIndex: 0,
                        headName: "",
                    },
                ],
                facialTransformationMatrixes: [
                    {
                        rows: 4,
                        columns: 4,
                        data: new Array(16).fill(0),
                    },
                ],
            },
            gesture: {
                landmarks: [[createLandmark()]],
                worldLandmarks: [[createLandmark()]],
                handedness: [[createCategory()]],
                handednesses: [[createCategory()]],
                gestures: [[createCategory()]],
            },
            timing: {
                mediaTimeMs: 120,
                videoWidth: 1280,
                videoHeight: 720,
            },
        });

        expect(result.ok).toBe(true);
    });

    it("rejects non-JSON runtime objects in raw slots with slot details", () => {
        const result = parseMotionReplayRawResultFrame({
            pose: {
                landmarks: [[createLandmark()]],
                worldLandmarks: [[createLandmark()]],
                segmentationMasks: [{ close: () => {} }],
            },
            timing: {
                mediaTimeMs: 120,
                videoWidth: 1280,
                videoHeight: 720,
            },
        });

        expect(result.ok).toBe(false);
        if (result.ok) {
            return;
        }
        expect(result.errors[0]).toMatchObject({
            slot: "pose",
        });
    });
});
