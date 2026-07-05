import { describe, expect, it } from "vitest";
import { RELIABILITY_MAP_SCHEMA_VERSION } from "../../../character/reliability/reliabilityMap";
import { CAMERA_QUALITY_SCHEMA_VERSION } from "../../../features/gaze/trackingRuntime/cameraQualityScore";
import { createMotionDebugViewerSnapshot } from "../motionDebugViewerModel";
import {
    createCameraQuality,
    createHandSnapshot,
    createLiveSnapshot,
    createManifest,
    createPoseSnapshot,
    createReliabilityMap,
} from "./motionDebugViewerTestFixtures";

describe("motion-debug viewer reliability and camera layers", () => {
    it("uses live snapshot reliability as the reliability layer fallback", () => {
        const reliability = createReliabilityMap(120);
        reliability.joints.leftHand = {
            ...reliability.joints.leftHand,
            source: "hand",
        };
        const liveSnapshot = createLiveSnapshot({
            hand: createHandSnapshot(),
            reliability,
        });

        const viewer = createMotionDebugViewerSnapshot({
            mode: "live",
            selectedLayer: "reliability",
            liveSnapshot,
            replayState: {
                status: "idle",
                frameCount: 0,
            },
        });

        expect(viewer.layers.reliability.status).toBe("available");
        expect(viewer.layers.reliability.value).toMatchObject({
            schemaVersion: RELIABILITY_MAP_SCHEMA_VERSION,
            timestamp: {
                mediaTimeMs: 120,
            },
            joints: {
                leftHand: {
                    source: "hand",
                },
            },
        });
        expect(liveSnapshot.hand).toMatchObject({
            detected: true,
            leftHand: {
                source: "roi",
                roi: {
                    source: "pose-wrist",
                },
            },
        });
    });

    it("uses saved replay reliability when live snapshot reliability is absent", () => {
        const liveSnapshot = createLiveSnapshot();

        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "reliability",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 240,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
                poseSnapshot: createPoseSnapshot(240),
                reliability: createReliabilityMap(240),
            },
        });

        expect(viewer.layers.reliability.status).toBe("available");
        expect(viewer.layers.reliability.value).toMatchObject({
            timestamp: {
                mediaTimeMs: 240,
            },
            gesture: {
                source: "gesture",
                label: "Open_Palm",
                confidence: 0.88,
                finalWeight: 0.72,
                stableDurationMs: 220,
                warnings: [],
            },
        });
        expect(JSON.stringify(viewer.layers.reliability.value)).not.toContain("categories");
        expect(JSON.stringify(viewer.layers.reliability.value)).not.toContain("handedness");
        expect(viewer.layers.reliability.value).toMatchObject({
            joints: {
                leftHand: {
                    source: "neutral",
                },
            },
        });
    });

    it("shows invalid replay reliability as an invalid parse error summary", () => {
        const liveSnapshot = createLiveSnapshot();

        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "reliability",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 240,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
                poseSnapshot: createPoseSnapshot(240),
                reliability: {
                    schemaVersion: RELIABILITY_MAP_SCHEMA_VERSION,
                    timestamp: {
                        mediaTimeMs: 240,
                    },
                },
            },
        });

        expect(viewer.layers.reliability.status).toBe("invalid");
        expect(viewer.layers.reliability.value).toMatchObject({
            parseStatus: "invalid",
            errors: expect.arrayContaining([
                expect.objectContaining({
                    code: "invalid_state",
                }),
            ]),
            raw: {
                schemaVersion: RELIABILITY_MAP_SCHEMA_VERSION,
            },
        });
        expect(viewer.layers.reliability.value).toHaveProperty("raw");
    });

    it("recalculates replay reliability from legacy poseSnapshot frames", () => {
        const liveSnapshot = createLiveSnapshot();

        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "reliability",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 240,
                },
                video: {
                    width: 640,
                    height: 360,
                },
                poseSnapshot: createPoseSnapshot(230),
            },
        });

        expect(viewer.layers.reliability.status).toBe("available");
        expect(viewer.layers.reliability.value).toMatchObject({
            schemaVersion: RELIABILITY_MAP_SCHEMA_VERSION,
            timestamp: {
                mediaTimeMs: 240,
                poseLastUpdatedAtMs: 230,
            },
            camera: {
                videoWidth: 640,
                videoHeight: 360,
            },
            joints: {
                leftHand: {
                    source: "neutral",
                    components: {
                        roi: {
                            reasonCodes: ["not_available_in_pose_snapshot"],
                        },
                    },
                },
            },
        });
    });

    it("marks legacy replay reliability as not recorded when poseSnapshot is missing", () => {
        const liveSnapshot = createLiveSnapshot();

        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "reliability",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 240,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
            },
        });

        expect(viewer.layers.reliability.status).toBe("not_recorded");
        expect(viewer.layers.reliability.value).toBeUndefined();
    });

    it("shows live camera quality in the camera layer", () => {
        const liveSnapshot = createLiveSnapshot({
            cameraQuality: createCameraQuality(120),
        });

        const viewer = createMotionDebugViewerSnapshot({
            mode: "live",
            selectedLayer: "camera",
            liveSnapshot,
            replayState: {
                status: "idle",
                frameCount: 0,
            },
        });

        expect(viewer.layers.camera.status).toBe("available");
        expect(viewer.layers.camera.value).toMatchObject({
            source: "fixture",
            quality: {
                schemaVersion: CAMERA_QUALITY_SCHEMA_VERSION,
                sample: {
                    mediaTimeMs: 120,
                },
            },
        });
    });

    it("keeps source none camera layer unrecorded when quality is absent", () => {
        const liveSnapshot = createLiveSnapshot({
            cameraSource: "none",
        });

        const viewer = createMotionDebugViewerSnapshot({
            mode: "live",
            selectedLayer: "camera",
            liveSnapshot,
            replayState: {
                status: "idle",
                frameCount: 0,
            },
        });

        expect(viewer.layers.camera.status).toBe("not_recorded");
    });

    it("prefers replay frame metrics cameraQuality over replay manifest camera", () => {
        const liveSnapshot = createLiveSnapshot();
        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "camera",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayManifest: createManifest(),
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 240,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
                metrics: {
                    cameraQuality: createCameraQuality(240),
                },
            },
        });

        expect(viewer.layers.camera.status).toBe("available");
        expect(viewer.layers.camera.value).toMatchObject({
            schemaVersion: CAMERA_QUALITY_SCHEMA_VERSION,
            sample: {
                mediaTimeMs: 240,
            },
        });
        expect(viewer.layers.camera.value).not.toHaveProperty("actualSettings");
    });
});
