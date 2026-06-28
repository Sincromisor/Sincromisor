import {
    parseMotionDebugLogLines,
    SINCRO_MOTION_DEBUG_LOG_SCHEMA_VERSION,
} from "../motionDebugLogSchema";
import type { MotionMetricBaseline } from "../motionMetricBaselineSchema";
import { calculateMotionMetricSummary, type MotionP0FixtureId } from "../motionMetrics";
import type { MotionQaRegressionConfig } from "../motionQaRegression";

export const GENERATED_AT_ISO = "2026-06-27T23:41:29.000Z";

export const BASE_CONFIG: MotionQaRegressionConfig = {
    generatedAtIso: GENERATED_AT_ISO,
    thresholdVersion: "initial-v1",
};

function createManifestLine(fixtureId: string): string {
    return JSON.stringify({
        recordType: "manifest",
        manifest: {
            schemaVersion: SINCRO_MOTION_DEBUG_LOG_SCHEMA_VERSION,
            createdAtIso: GENERATED_AT_ISO,
            source: {
                kind: "synthetic",
                fixtureId,
            },
            environment: {
                userAgent: "vitest",
                devicePixelRatio: 1,
                viewport: {
                    width: 1280,
                    height: 720,
                },
            },
            build: {
                appVersion: "0.0.0",
                packageVersions: {},
                configHash: "motion-qa-regression-test",
            },
            camera: {
                requestedConstraints: {},
                actualSettings: {
                    width: 1280,
                    height: 720,
                    frameRate: 30,
                },
            },
            pipeline: {
                tracker: "synthetic",
            },
            avatar: {
                avatarProfileId: "default",
                boneCapabilities: {},
            },
        },
    });
}

function createFrameLine(frameIndex: number, mediaTimeMs: number, overBudget = false): string {
    return JSON.stringify({
        recordType: "frame",
        frame: {
            frameIndex,
            timestamp: {
                mediaTimeMs,
            },
            video: {
                width: 1280,
                height: 720,
            },
            metrics: {
                tracker: {
                    droppedFrames: 0,
                    budget: {
                        budgetStatus: overBudget ? "over_budget" : "ok",
                        degradation: {
                            state: "full",
                        },
                    },
                    degradationPolicy: {
                        schemaVersion: "sincro.tracker-degradation-policy.v1",
                        stage: "full",
                        reasonCodes: [],
                        effectiveCadence: {
                            faceFps: 30,
                            poseFps: 30,
                            handFps: 30,
                            faceRoiFps: 10,
                            gestureFps: 10,
                        },
                        recovering: false,
                    },
                    roi: {
                        pauseState: "active",
                        fallbackCount: 0,
                        skippedFrames: 0,
                        consecutiveOverBudgetFrames: 0,
                        reasonCodes: [],
                    },
                },
            },
        },
    });
}

export function createLogText(fixtureId: string, overBudgetFrameCount = 0): string {
    const frameLines = [0, 1, 2].map((frameIndex) =>
        createFrameLine(frameIndex, frameIndex * 100, frameIndex < overBudgetFrameCount),
    );
    return [createManifestLine(fixtureId), ...frameLines].join("\n");
}

export function logLines(text: string): string[] {
    const lines = text.split(/\r?\n/);
    while (lines.length > 0 && lines[lines.length - 1] === "") {
        lines.pop();
    }
    return lines;
}

export function createBaseline(
    fixtureId: MotionP0FixtureId,
    logText: string,
    config: MotionQaRegressionConfig = BASE_CONFIG,
): MotionMetricBaseline {
    const parsed = parseMotionDebugLogLines(logLines(logText));
    if (!parsed.ok) {
        throw new Error("Synthetic log should parse before creating a baseline.");
    }
    return {
        schemaVersion: "sincro.motion-metric-baseline.v1",
        fixtureId,
        logId: `${fixtureId}-synthetic`,
        thresholdVersion: "initial-v1",
        metricSummary: calculateMotionMetricSummary(parsed.frames, {
            fixtureId,
            generatedAtIso: config.generatedAtIso,
            thresholdVersion: config.thresholdVersion,
            thresholds: config.thresholds,
        }),
    };
}
