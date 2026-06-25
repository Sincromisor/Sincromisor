import { describe, expect, it } from "vitest";
import type {
    CameraQualityComponent,
    CameraQualityScore,
} from "../../../features/gaze/trackingRuntime/cameraQualityScore";
import {
    CANONICAL_UPPER_BODY_SCHEMA_VERSION,
    type CanonicalUpperBodyState,
    DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT,
} from "../../canonical/canonicalUpperBodyState";
import { createDefaultReliabilityMap, type ReliabilityMap } from "../../reliability/reliabilityMap";
import {
    createCanonicalCalibrationFromInitialSession,
    evaluateInitialCalibrationStep,
    type InitialCalibrationStepResult,
    type InitialSincroCalibrationSession,
    mapInitialCalibrationGuideMessages,
    SINCRO_INITIAL_CALIBRATION_SCHEMA_VERSION,
    summarizeInitialCalibrationSession,
} from "../initialSincroCalibration";

describe("initial sincro calibration", () => {
    it("summarizes all required ready steps as ready", () => {
        const reliability = createReadyReliability();
        const canonical = createCanonicalState(0);
        const session = summarizeInitialCalibrationSession(
            createSession({
                precheck: evaluate("precheck", reliability, canonical),
                neutral: evaluate("neutral", reliability, canonical),
                a_pose: evaluate("a_pose", reliability, canonical),
                hand_open: evaluate("hand_open", reliability, canonical),
            }),
        );

        expect(session.status).toBe("ready");
        expect(session.userGuideMessages).toEqual([]);
        expect(session.debugReasons).toEqual([]);
    });

    it("keeps the session ready without hands when only hand_open is degraded or retry", () => {
        for (const scenario of [
            { leftHand: 0.55, rightHand: 0.54, expectedStatus: "degraded" },
            { leftHand: 0.2, rightHand: 0.1, expectedStatus: "retry" },
        ]) {
            const reliability = createReadyReliability();
            reliability.parts.leftHand.finalWeight = scenario.leftHand;
            reliability.parts.rightHand.finalWeight = scenario.rightHand;
            const canonical = createCanonicalState(0);
            const session = summarizeInitialCalibrationSession(
                createSession({
                    precheck: evaluate("precheck", reliability, canonical),
                    neutral: evaluate("neutral", reliability, canonical),
                    a_pose: evaluate("a_pose", reliability, canonical),
                    hand_open: evaluate("hand_open", reliability, canonical),
                }),
            );

            expect(session.steps.hand_open?.status).toBe(scenario.expectedStatus);
            expect(session.status).toBe("ready_without_hands");
        }
    });

    it("summarizes degraded core steps as retry_recommended", () => {
        const reliability = createReadyReliability();
        reliability.parts.torso.finalWeight = 0.7;
        const canonical = createCanonicalState(0);
        const session = summarizeInitialCalibrationSession(
            createSession({
                precheck: evaluate("precheck", reliability, canonical),
                neutral: evaluate("neutral", reliability, canonical),
                a_pose: evaluate("a_pose", reliability, canonical),
                hand_open: evaluate("hand_open", reliability, canonical),
            }),
        );

        expect(session.steps.neutral?.status).toBe("degraded");
        expect(session.status).toBe("retry_recommended");
    });

    it("summarizes core reliability below degraded threshold as failed", () => {
        const reliability = createReadyReliability();
        reliability.joints.leftElbow.finalWeight = 0.2;
        const canonical = createCanonicalState(0);
        const session = summarizeInitialCalibrationSession(
            createSession({
                precheck: evaluate("precheck", reliability, canonical),
                neutral: evaluate("neutral", reliability, canonical),
                a_pose: evaluate("a_pose", reliability, canonical),
                hand_open: evaluate("hand_open", reliability, canonical),
            }),
        );

        expect(session.steps.a_pose?.status).toBe("retry");
        expect(session.status).toBe("failed");
    });

    it("does not lower the summary status when optional face yaw fails", () => {
        const reliability = createReadyReliability();
        const canonical = createCanonicalState(Math.PI / 2);
        const session = summarizeInitialCalibrationSession(
            createSession({
                precheck: evaluate("precheck", reliability, createCanonicalState(0)),
                neutral: evaluate("neutral", reliability, createCanonicalState(0)),
                a_pose: evaluate("a_pose", reliability, createCanonicalState(0)),
                hand_open: evaluate("hand_open", reliability, createCanonicalState(0)),
                face_yaw_optional: evaluate("face_yaw_optional", reliability, canonical),
            }),
        );

        expect(session.steps.face_yaw_optional?.status).toBe("retry");
        expect(session.status).toBe("ready");
    });

    it("maps retry reasons to deterministic user guide messages by priority", () => {
        const messages = mapInitialCalibrationGuideMessages([
            "low_reliability",
            "hand_not_visible",
            "camera_unavailable",
            "hand_not_visible",
            "shoulders_out_of_frame",
        ]);
        expect(messages).toEqual([
            "カメラを確認してください。",
            "肩まで画面に入るように、少し下がってください。",
        ]);
    });

    it("creates canonical calibration snapshot from session measurements and defaults", () => {
        const session = createSession({
            neutral: createStep("neutral", {
                neutralYawRad: 0.12,
                shoulderWidth: 0.42,
            }),
            hand_open: createStep("hand_open", {
                handBaseline: {
                    left: { palmSize: 0.2, openSpread: 0.8 },
                    right: { palmSize: 0.21, openSpread: 0.81 },
                },
            }),
        });
        const calibration = createCanonicalCalibrationFromInitialSession(session);

        expect(calibration).toEqual({
            id: "initial-calibration:1000:2500",
            source: "initial",
            capturedAtMediaTimeMs: 2500,
            neutralYawRad: 0.12,
            shoulderWidth: 0.42,
            torsoScale: DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT.torsoScale,
            handBaseline: {
                left: { palmSize: 0.2, openSpread: 0.8 },
                right: { palmSize: 0.21, openSpread: 0.81 },
            },
        });
    });
});

function evaluate(
    id: InitialCalibrationStepResult["id"],
    reliability: ReliabilityMap,
    canonical: CanonicalUpperBodyState,
): InitialCalibrationStepResult {
    return evaluateInitialCalibrationStep({
        id,
        reliability,
        canonical,
        cameraQuality: createReadyCameraQuality(),
        validDurationMs: 1100,
    });
}

function createSession(
    steps: InitialSincroCalibrationSession["steps"],
): InitialSincroCalibrationSession {
    return {
        schemaVersion: SINCRO_INITIAL_CALIBRATION_SCHEMA_VERSION,
        status: "not_started",
        startedAtMediaTimeMs: 1000,
        completedAtMediaTimeMs: 2500,
        steps,
        userGuideMessages: [],
        debugReasons: [],
    };
}

function createStep(
    id: InitialCalibrationStepResult["id"],
    measurements: InitialCalibrationStepResult["measurements"],
): InitialCalibrationStepResult {
    return {
        id,
        status: "ready",
        validDurationMs: 1100,
        score: 1,
        retryReasons: [],
        measurements,
        debug: {},
    };
}

function createReadyReliability(): ReliabilityMap {
    const reliability = createDefaultReliabilityMap(1234);
    reliability.parts.torso.finalWeight = 0.9;
    reliability.parts.head.finalWeight = 0.9;
    reliability.parts.leftHand.finalWeight = 0.9;
    reliability.parts.rightHand.finalWeight = 0.9;
    reliability.joints.leftElbow.finalWeight = 0.9;
    reliability.joints.rightElbow.finalWeight = 0.9;
    reliability.joints.leftWrist.finalWeight = 0.9;
    reliability.joints.rightWrist.finalWeight = 0.9;
    return reliability;
}

function createReadyCameraQuality(): CameraQualityScore {
    return {
        schemaVersion: "sincro.camera-quality.v1",
        overall: { score: 0.95, status: "good" },
        components: {
            resolution: createCameraComponent(1),
            cadence: createCameraComponent(1),
            torsoInFrame: createCameraComponent(0.9),
            handsInFrame: createCameraComponent(0.9),
            borderRisk: createCameraComponent(0.8),
            handSmallRisk: createCameraComponent(0.8),
            motionBlurRisk: createCameraComponent(1),
        },
        reasons: [],
        guideMessages: [],
        track: { width: 1280, height: 720, frameRate: 30, readyState: "live" },
        sample: {
            videoWidth: 1280,
            videoHeight: 720,
            poseDetected: true,
            poseConfidence: 0.95,
        },
    };
}

function createCameraComponent(score: number): CameraQualityComponent {
    return {
        score,
        status: "good",
        reasonCodes: [],
    };
}

function createCanonicalState(yawRad: number): CanonicalUpperBodyState {
    return {
        schemaVersion: CANONICAL_UPPER_BODY_SCHEMA_VERSION,
        timestamp: { mediaTimeMs: 1234 },
        torso: {
            coordinateSystem: "body_local",
            shoulderCenter: [0, 1, 0],
            bodyRight: [1, 0, 0],
            bodyUp: [0, 1, 0],
            bodyFront: [0, 0, 1],
            shoulderWidth: 0.5,
            torsoScale: 1.1,
            yawRad,
            confidence: 1,
            source: "pose",
            warnings: [],
            outOfRangeFields: [],
        },
        arms: {
            left: createArmState(),
            right: createArmState(),
        },
        calibration: {
            ...DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT,
            handBaseline: {
                left: { palmSize: 0.11, openSpread: 0.7 },
                right: { palmSize: 0.12, openSpread: 0.72 },
            },
        },
        warnings: [],
    };
}

function createArmState(): CanonicalUpperBodyState["arms"]["left"] {
    return {
        confidence: 1,
        source: "pose",
        warnings: [],
        outOfRangeFields: [],
        reach: 0.5,
        elevationRad: 0,
        openness: 0,
        forwardness: 0,
        elbowFlexionRad: 1,
        classification: "side",
    };
}
