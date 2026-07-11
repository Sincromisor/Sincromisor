import type { CameraQualityScore } from "../../features/gaze/trackingRuntime/cameraQualityScore";
import type { CanonicalUpperBodyState } from "../canonical/canonicalUpperBodyState";
import type { ReliabilityMap } from "../reliability/reliabilityMap";
import {
    InitialSincroCalibrationController,
    type InitialSincroCalibrationControllerResult,
} from "./initialSincroCalibrationController";
import { evaluateInitialCalibrationStep } from "./initialSincroCalibrationStepEvaluation";

export type InitialSincroCalibrationPoseObservation = {
    reliability: ReliabilityMap;
    cameraQuality?: CameraQualityScore;
    canonical?: CanonicalUpperBodyState;
    mediaTimeMs: number;
};

/**
 * production Pose callback の reliability / camera / canonical を既存 step evaluator と retry controllerへ橋渡しする。
 *
 * session / step / entry generation が変わるたび duration を0から計測する。record actionには読み取ったactive
 * session idを必ず付けるため、cancelや新sessionと競合した旧callbackはcontrollerのstale guardで拒否される。
 */
export class InitialSincroCalibrationPoseBridge {
    private stepKey: string | undefined;
    private stepStartedAtMs = 0;

    constructor(private readonly controller = InitialSincroCalibrationController.getManager()) {}

    record(
        observation: InitialSincroCalibrationPoseObservation,
    ): InitialSincroCalibrationControllerResult | undefined {
        const active = this.controller.getState();
        if (active.status !== "active" || !Number.isFinite(observation.mediaTimeMs)) {
            return undefined;
        }
        const key = `${active.sessionId}:${active.currentStep}:${active.session.steps[active.currentStep] === undefined ? "missing" : "recorded"}`;
        if (key !== this.stepKey) {
            this.stepKey = key;
            this.stepStartedAtMs = observation.mediaTimeMs;
        }
        const result = evaluateInitialCalibrationStep({
            id: active.currentStep,
            reliability: observation.reliability,
            cameraQuality: observation.cameraQuality,
            canonical: observation.canonical,
            validDurationMs: Math.max(0, observation.mediaTimeMs - this.stepStartedAtMs),
        });
        return this.controller.dispatch({ type: "record", sessionId: active.sessionId, result });
    }
}
