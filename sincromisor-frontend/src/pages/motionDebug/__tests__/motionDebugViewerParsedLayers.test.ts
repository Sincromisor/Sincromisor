import { describe, expect, it } from "vitest";
import { CANONICAL_UPPER_BODY_SCHEMA_VERSION } from "../../../character/canonical/canonicalUpperBodyState";
import { createDefaultMotionIntentState } from "../../../character/motionIntent/motionIntentState";
import { createNoopMotionPostProcessingResult } from "../../../character/motionPostProcessing/motionPostProcessingState";
import { TEMPORAL_UPPER_BODY_SCHEMA_VERSION } from "../../../character/temporal/temporalUpperBodyState";
import { createMotionDebugViewerSnapshot } from "../motionDebugViewerModel";
import {
    createCanonicalState,
    createLiveSnapshot,
    createTemporalState,
} from "./motionDebugViewerTestFixtures";

describe("motion-debug viewer parsed layers", () => {
    it("marks missing replay intent as not recorded", () => {
        const liveSnapshot = createLiveSnapshot();
        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "intent",
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
                    mediaTimeMs: 120,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
            },
        });

        expect(viewer.layers.intent.status).toBe("not_recorded");
    });

    it("shows saved replay intent after strict parsing", () => {
        const liveSnapshot = createLiveSnapshot();
        const intent = createDefaultMotionIntentState(120);
        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "intent",
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
                    mediaTimeMs: 120,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
                intent,
            },
        });

        expect(viewer.layers.intent.status).toBe("available");
        expect(viewer.layers.intent.value).toMatchObject({
            schemaVersion: "sincro.motion-intent.v1",
            arms: {
                left: {
                    intent: "tracking",
                    source: "fallback",
                },
            },
            warnings: ["fallback_active"],
        });
    });

    it("marks invalid saved replay intent without failing log load", () => {
        const liveSnapshot = createLiveSnapshot();
        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "intent",
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
                    mediaTimeMs: 120,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
                intent: {
                    ...createDefaultMotionIntentState(120),
                    arms: {
                        left: {
                            ...createDefaultMotionIntentState(120).arms.left,
                            intent: "thumbs_up",
                        },
                        right: createDefaultMotionIntentState(120).arms.right,
                    },
                },
            },
        });

        expect(viewer.layers.intent.status).toBe("invalid");
        expect(viewer.layers.intent.value).toMatchObject({
            parseStatus: "invalid",
            errors: expect.arrayContaining([
                expect.objectContaining({
                    code: "invalid_state",
                    path: ["arms", "left", "intent"],
                }),
            ]),
        });
    });

    it("marks missing replay postProcessing as not recorded", () => {
        const liveSnapshot = createLiveSnapshot({
            postProcessing: createNoopMotionPostProcessingResult({
                mediaTimeMs: 120,
                source: "live",
            }),
        });
        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "postProcessing",
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
                    mediaTimeMs: 120,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
            },
        });

        expect(viewer.layers.postProcessing.status).toBe("not_recorded");
    });

    it("shows saved replay postProcessing after strict parsing", () => {
        const liveSnapshot = createLiveSnapshot();
        const postProcessing = createNoopMotionPostProcessingResult({
            mediaTimeMs: 120,
            source: "replay",
        });
        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "postProcessing",
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
                    mediaTimeMs: 120,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
                postProcessing,
            },
        });

        expect(viewer.layers.postProcessing.status).toBe("available");
        expect(viewer.layers.postProcessing.value).toMatchObject({
            schemaVersion: "sincro.motion-post-processing.v1",
            processor: {
                id: "noop",
                mode: "disabled",
            },
            output: {},
            corrections: [],
            warnings: ["processor_disabled"],
        });
    });

    it("marks invalid saved replay postProcessing without live fallback", () => {
        const liveSnapshot = createLiveSnapshot({
            postProcessing: createNoopMotionPostProcessingResult({
                mediaTimeMs: 120,
                source: "live",
            }),
        });
        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "postProcessing",
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
                    mediaTimeMs: 120,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
                postProcessing: {
                    ...createNoopMotionPostProcessingResult({
                        mediaTimeMs: 120,
                        source: "replay",
                    }),
                    processor: {
                        id: "noop",
                        version: "v1",
                        mode: "off",
                    },
                },
            },
        });

        expect(viewer.layers.postProcessing.status).toBe("invalid");
        expect(viewer.layers.postProcessing.value).toMatchObject({
            parseStatus: "invalid",
            errors: expect.arrayContaining([
                expect.objectContaining({
                    code: "invalid_state",
                    path: ["processor", "mode"],
                }),
            ]),
        });
    });
    it("uses live snapshot canonical as the canonical layer fallback", () => {
        const liveSnapshot = createLiveSnapshot({
            canonical: createCanonicalState(120),
        });

        const viewer = createMotionDebugViewerSnapshot({
            mode: "live",
            selectedLayer: "canonical",
            liveSnapshot,
            replayState: {
                status: "idle",
                frameCount: 0,
            },
        });

        expect(viewer.layers.canonical.status).toBe("available");
        expect(viewer.layers.canonical.value).toMatchObject({
            schemaVersion: CANONICAL_UPPER_BODY_SCHEMA_VERSION,
            timestamp: {
                mediaTimeMs: 120,
            },
            arms: {
                left: {
                    reach: 0.52,
                    elevationRad: 0.12,
                    openness: 0.24,
                    forwardness: 0.7,
                    elbowFlexionRad: 1.05,
                    classification: "front",
                    source: "mixed",
                    warnings: ["missing_world_coordinates"],
                    outOfRangeFields: [
                        {
                            path: "reach",
                            clampedValue: 1.15,
                        },
                    ],
                },
                right: {
                    classification: "side",
                },
            },
            calibration: {
                id: "calibration-120",
            },
        });
    });

    it("prefers replay frame canonical over live snapshot canonical", () => {
        const liveSnapshot = createLiveSnapshot({
            canonical: createCanonicalState(120),
        });

        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "canonical",
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
                canonical: createCanonicalState(240),
            },
        });

        expect(viewer.layers.canonical.status).toBe("available");
        expect(viewer.layers.canonical.value).toMatchObject({
            timestamp: {
                mediaTimeMs: 240,
            },
            calibration: {
                id: "calibration-240",
            },
        });
    });

    it("shows invalid replay canonical as an invalid parse error summary", () => {
        const liveSnapshot = createLiveSnapshot({
            canonical: createCanonicalState(120),
        });

        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "canonical",
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
                canonical: {
                    schemaVersion: CANONICAL_UPPER_BODY_SCHEMA_VERSION,
                    timestamp: {
                        mediaTimeMs: 240,
                    },
                },
            },
        });

        expect(viewer.layers.canonical.status).toBe("invalid");
        expect(viewer.layers.canonical.value).toMatchObject({
            parseStatus: "invalid",
            errors: expect.arrayContaining([
                expect.objectContaining({
                    code: "invalid_state",
                }),
            ]),
            raw: {
                schemaVersion: CANONICAL_UPPER_BODY_SCHEMA_VERSION,
            },
        });
    });

    it("uses live snapshot temporal as the temporal layer value", () => {
        const liveSnapshot = createLiveSnapshot({
            temporal: createTemporalState(120),
        });

        const viewer = createMotionDebugViewerSnapshot({
            mode: "live",
            selectedLayer: "temporal",
            liveSnapshot,
            replayState: {
                status: "idle",
                frameCount: 0,
            },
        });

        expect(viewer.layers.temporal.status).toBe("available");
        expect(viewer.layers.temporal.value).toMatchObject({
            schemaVersion: TEMPORAL_UPPER_BODY_SCHEMA_VERSION,
            arms: {
                left: {
                    state: "recovering",
                    confidence: 0.72,
                    source: "mixed",
                    stateAgeMs: 32,
                    observedAgeMs: 0,
                    warnings: ["recovery_blend"],
                    recoveringBlend: {
                        progress: 0.5,
                    },
                    velocity: {
                        wrist: [0.01, 0.02, 0.03],
                    },
                    bodyLocalWrist: [0.1, 0.2, 0.3],
                },
            },
        });
    });

    it("prefers saved replay temporal over live snapshot temporal", () => {
        const liveSnapshot = createLiveSnapshot({
            temporal: createTemporalState(120),
        });

        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "temporal",
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
                temporal: createTemporalState(240),
            },
        });

        expect(viewer.layers.temporal.status).toBe("available");
        expect(viewer.layers.temporal.value).toMatchObject({
            timestamp: {
                mediaTimeMs: 240,
            },
        });
    });

    it("shows invalid replay temporal as an invalid parse error summary", () => {
        const liveSnapshot = createLiveSnapshot({
            temporal: createTemporalState(120),
        });

        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "temporal",
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
                temporal: {
                    schemaVersion: TEMPORAL_UPPER_BODY_SCHEMA_VERSION,
                    timestamp: {
                        mediaTimeMs: 240,
                    },
                },
            },
        });

        expect(viewer.layers.temporal.status).toBe("invalid");
        expect(viewer.layers.temporal.value).toMatchObject({
            parseStatus: "invalid",
            errors: expect.arrayContaining([
                expect.objectContaining({
                    code: "invalid_state",
                }),
            ]),
            raw: {
                schemaVersion: TEMPORAL_UPPER_BODY_SCHEMA_VERSION,
            },
        });
    });

    it("marks replay temporal as not recorded when old logs do not have frame.temporal", () => {
        const liveSnapshot = createLiveSnapshot({
            temporal: createTemporalState(120),
        });

        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "temporal",
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

        expect(viewer.layers.temporal.status).toBe("not_recorded");
        expect(viewer.layers.temporal.value).toBeUndefined();
    });
});
