/**
 * `sincro.tracker-degradation-policy.v1` の ordered degradation state machine。
 *
 * Worker budget と ROI budget を同じ順序付き stage に畳み、camera / Face full-frame tracking は
 * 最後まで維持する。stage 進行・復帰は連続 frame 数で hysteresis を作り、単発の推論時間スパイクで
 * Pose / ROI が振動しないようにする。
 */
import type {
    SincroTrackerRoiPauseState,
    SincroTrackerRoiReasonCode,
} from "./sincroTrackerWorkerTypes";
import { clampTrackerRuntimeTargetsForMainThreadFallback } from "./trackerRuntimeFpsPolicy";
import type {
    TrackerPerformanceBudgetStatus,
    TrackerPerformanceReasonCode,
    TrackerRuntimeDegradationState,
} from "./trackerRuntimePerformanceBudget";
import type { TrackerRuntimePerformanceProfile } from "./trackerRuntimePerformanceProfile";

/**
 * Debug stats に保存する ordered degradation policy snapshot の schemaVersion。
 *
 * 既存 `TrackerRuntimeDegradationState` の enum 名は互換のため維持し、詳細 stage はこの v1 snapshot に閉じる。
 */
export const TRACKER_RUNTIME_DEGRADATION_POLICY_SCHEMA_VERSION =
    "sincro.tracker-degradation-policy.v1" as const;

/**
 * Controller 内部 state の保存 version。
 *
 * runtime restart をまたぐ永続保存 contract ではなく、debug stats が policy snapshot と controller
 * state を区別するための値である。公開 stats の schemaVersion は
 * `TRACKER_RUNTIME_DEGRADATION_POLICY_SCHEMA_VERSION` を使う。
 */
export const TRACKER_RUNTIME_DEGRADATION_POLICY_STATE_SCHEMA_VERSION =
    "sincro.tracker-degradation-policy-state.v1" as const;

/**
 * Ordered degradation policy の固定 stage。
 *
 * 配列順が負荷低減の順序で、`face-only` / `comfortable-idle` だけが Pose 系 callback の停止を伴う。
 * `ignorePerformanceFallback` はこの後半 2 stage への自動遷移だけを抑制し、低 fps 化と ROI pause は
 * debug stats に出し続ける。
 */
export type TrackerRuntimeDegradationStage =
    | "full"
    | "gesture-reduced-fps"
    | "optional-pass-reduced-fps"
    | "roi-hand-paused"
    | "pose-reduced-fps"
    | "face-only"
    | "comfortable-idle";

/**
 * policy 適用後に runtime が使う target cadence。
 *
 * `faceFps` は full-frame Face tracking の cadence で、`face-only` / `comfortable-idle` でも維持される。
 * Pose / Hand / Face ROI が停止する stage では該当 fps を `0` にして snapshot へ出す。
 */
export type TrackerRuntimeDegradationPolicyCadence = {
    faceFps: number;
    poseFps: number;
    handFps: number;
    faceRoiFps: number;
    gestureFps: number;
};

/**
 * Debug Console / motion-debug metrics に出す policy snapshot。
 *
 * `effectiveCadence` は policy stage と main-thread fallback clamp の適用後の値で、profile の raw
 * cadence ではない。`reasonCodes` には Worker budget と ROI reason を合成するが、ROI controller
 * 自体の fallback / skipped counter はここでは増やさない。
 */
export type TrackerRuntimeDegradationPolicySnapshot = {
    schemaVersion: typeof TRACKER_RUNTIME_DEGRADATION_POLICY_SCHEMA_VERSION;
    stage: TrackerRuntimeDegradationStage;
    previousStage?: TrackerRuntimeDegradationStage;
    reasonCodes: TrackerPerformanceReasonCode[];
    sinceMediaTimeMs?: number;
    effectiveCadence: TrackerRuntimeDegradationPolicyCadence;
    recovering: boolean;
};

/**
 * Controller が保持する hysteresis state。
 *
 * `consecutiveOverBudgetFrames` と `consecutiveWithinBudgetFrames` は stage 遷移時に必ず reset する。
 * 二重起動や reset 後の古い callback が混ざっても、caller は `reset()` 後の state だけを正本として
 * 扱う。
 */
export type TrackerRuntimeDegradationPolicyState = {
    schemaVersion: typeof TRACKER_RUNTIME_DEGRADATION_POLICY_STATE_SCHEMA_VERSION;
    stage: TrackerRuntimeDegradationStage;
    previousStage?: TrackerRuntimeDegradationStage;
    consecutiveOverBudgetFrames: number;
    consecutiveWithinBudgetFrames: number;
    sinceMediaTimeMs?: number;
    recovering: boolean;
};

/**
 * 1 frame 分の budget / ROI 観測を policy に渡す入力。
 *
 * `mediaTimeMs` は video frame clock 由来の時刻基準で、`performance.now()` ではない。Pose recovery は
 * `poseDetected` と profile 由来 pose budget の両方を満たす場合だけ許可され、Face-only から低 fps
 * Pose へ戻る途中で未検出 Pose を再開扱いにしない。
 */
export type TrackerRuntimeDegradationPolicyInput = {
    mediaTimeMs: number;
    profile: TrackerRuntimePerformanceProfile;
    budgetStatus?: TrackerPerformanceBudgetStatus;
    budgetReasonCodes?: TrackerPerformanceReasonCode[];
    poseInferenceTimeMs?: number;
    poseDetected?: boolean;
    roi?: {
        pauseState: SincroTrackerRoiPauseState;
        consecutiveOverBudgetFrames: number;
        reasonCodes: SincroTrackerRoiReasonCode[];
    };
    mainThreadFallbackActive?: boolean;
    ignorePerformanceFallback?: boolean;
};

/**
 * Runtime が次 frame で適用する degradation decision。
 *
 * `shouldDegradeToFaceOnly` / `shouldEnterComfortableIdle` は runtime fallback 起動の合図だけであり、
 * comfortable pose の blend は Temporal / MotionSolver / VrmPoseComposer 側が所有する。
 */
export type TrackerRuntimeDegradationPolicyDecision = {
    state: TrackerRuntimeDegradationPolicyState;
    snapshot: TrackerRuntimeDegradationPolicySnapshot;
    effectiveCadence: TrackerRuntimeDegradationPolicyCadence;
    trackerDegradationState: TrackerRuntimeDegradationState;
    roiPauseState?: SincroTrackerRoiPauseState;
    shouldDegradeToFaceOnly: boolean;
    shouldEnterComfortableIdle: boolean;
    reasonCodes: TrackerPerformanceReasonCode[];
};

const DEGRADATION_STAGES: TrackerRuntimeDegradationStage[] = [
    "full",
    "gesture-reduced-fps",
    "optional-pass-reduced-fps",
    "roi-hand-paused",
    "pose-reduced-fps",
    "face-only",
    "comfortable-idle",
];

/**
 * TrackerRuntime の ordered degradation lifecycle を所有する controller。
 *
 * `update()` は frame ごとに同期的に state を進め、snapshot と runtime fallback flag を返す。Worker
 * client、ROI controller、camera track の生成・解放は所有せず、`reset()` は camera stop / source
 * reset 時に hysteresis counter と previous stage を破棄するために呼ぶ。
 */
export class TrackerRuntimeDegradationPolicyController {
    private state: TrackerRuntimeDegradationPolicyState = createInitialState();

    reset(): void {
        this.state = createInitialState();
    }

    getState(): TrackerRuntimeDegradationPolicyState {
        return cloneState(this.state);
    }

    update(input: TrackerRuntimeDegradationPolicyInput): TrackerRuntimeDegradationPolicyDecision {
        this.state = this.reduceState(input);
        return createDecision(this.state, input);
    }

    private reduceState(
        input: TrackerRuntimeDegradationPolicyInput,
    ): TrackerRuntimeDegradationPolicyState {
        if (isOverBudgetFrame(input)) {
            return this.recordOverBudgetFrame(input);
        }
        if (isWithinBudgetFrame(input)) {
            return this.recordWithinBudgetFrame(input);
        }
        return {
            ...this.state,
            recovering: false,
        };
    }

    private recordOverBudgetFrame(
        input: TrackerRuntimeDegradationPolicyInput,
    ): TrackerRuntimeDegradationPolicyState {
        const consecutiveOverBudgetFrames = this.state.consecutiveOverBudgetFrames + 1;
        if (
            consecutiveOverBudgetFrames <
            input.profile.degradationBudget.consecutiveOverBudgetFrames
        ) {
            return {
                ...this.state,
                consecutiveOverBudgetFrames,
                consecutiveWithinBudgetFrames: 0,
                recovering: false,
            };
        }

        const nextStage = resolveNextStage(this.state.stage, input.ignorePerformanceFallback);
        if (nextStage === this.state.stage) {
            return {
                ...this.state,
                consecutiveOverBudgetFrames: 0,
                consecutiveWithinBudgetFrames: 0,
                recovering: false,
            };
        }
        return transitionState(this.state, nextStage, input.mediaTimeMs, false);
    }

    private recordWithinBudgetFrame(
        input: TrackerRuntimeDegradationPolicyInput,
    ): TrackerRuntimeDegradationPolicyState {
        if (!canRecoverFromCurrentStage(this.state.stage, input)) {
            return {
                ...this.state,
                consecutiveOverBudgetFrames: 0,
                consecutiveWithinBudgetFrames: 0,
                recovering: this.state.stage !== "full",
            };
        }
        const consecutiveWithinBudgetFrames = this.state.consecutiveWithinBudgetFrames + 1;
        if (consecutiveWithinBudgetFrames < input.profile.degradationBudget.recoveryFrames) {
            return {
                ...this.state,
                consecutiveOverBudgetFrames: 0,
                consecutiveWithinBudgetFrames,
                recovering: this.state.stage !== "full",
            };
        }

        const previousStage = resolvePreviousStage(this.state.stage);
        if (previousStage === this.state.stage) {
            return {
                ...this.state,
                consecutiveOverBudgetFrames: 0,
                consecutiveWithinBudgetFrames: 0,
                recovering: false,
            };
        }
        return transitionState(this.state, previousStage, input.mediaTimeMs, true);
    }
}

function createInitialState(): TrackerRuntimeDegradationPolicyState {
    return {
        schemaVersion: TRACKER_RUNTIME_DEGRADATION_POLICY_STATE_SCHEMA_VERSION,
        stage: "full",
        consecutiveOverBudgetFrames: 0,
        consecutiveWithinBudgetFrames: 0,
        recovering: false,
    };
}

function createDecision(
    state: TrackerRuntimeDegradationPolicyState,
    input: TrackerRuntimeDegradationPolicyInput,
): TrackerRuntimeDegradationPolicyDecision {
    const reasonCodes = resolveReasonCodes(state.stage, input);
    const effectiveCadence = resolveEffectiveCadence(state.stage, input.profile);
    const clampedCadence =
        input.mainThreadFallbackActive === true
            ? clampCadenceForMainThreadFallback(effectiveCadence)
            : effectiveCadence;
    const snapshot: TrackerRuntimeDegradationPolicySnapshot = {
        schemaVersion: TRACKER_RUNTIME_DEGRADATION_POLICY_SCHEMA_VERSION,
        stage: state.stage,
        previousStage: state.previousStage,
        reasonCodes,
        sinceMediaTimeMs: state.sinceMediaTimeMs,
        effectiveCadence: clampedCadence,
        recovering: state.recovering,
    };

    return {
        state: cloneState(state),
        snapshot,
        effectiveCadence: clampedCadence,
        trackerDegradationState:
            input.mainThreadFallbackActive === true
                ? "main-thread-low-fps"
                : resolveTrackerDegradationState(state.stage),
        roiPauseState:
            stageIndex(state.stage) >= stageIndex("roi-hand-paused") ? "hand-paused" : undefined,
        shouldDegradeToFaceOnly: state.stage === "face-only",
        shouldEnterComfortableIdle: state.stage === "comfortable-idle",
        reasonCodes,
    };
}

function transitionState(
    current: TrackerRuntimeDegradationPolicyState,
    stage: TrackerRuntimeDegradationStage,
    mediaTimeMs: number,
    recovering: boolean,
): TrackerRuntimeDegradationPolicyState {
    return {
        schemaVersion: TRACKER_RUNTIME_DEGRADATION_POLICY_STATE_SCHEMA_VERSION,
        stage,
        previousStage: current.stage,
        consecutiveOverBudgetFrames: 0,
        consecutiveWithinBudgetFrames: 0,
        sinceMediaTimeMs: mediaTimeMs,
        recovering,
    };
}

function cloneState(
    state: TrackerRuntimeDegradationPolicyState,
): TrackerRuntimeDegradationPolicyState {
    return { ...state };
}

function isOverBudgetFrame(input: TrackerRuntimeDegradationPolicyInput): boolean {
    return (
        input.budgetStatus === "over_budget" ||
        (input.roi?.consecutiveOverBudgetFrames ?? 0) >=
            input.profile.degradationBudget.consecutiveOverBudgetFrames
    );
}

function isWithinBudgetFrame(input: TrackerRuntimeDegradationPolicyInput): boolean {
    return (
        input.budgetStatus === "ok" &&
        input.roi !== undefined &&
        input.roi.consecutiveOverBudgetFrames === 0
    );
}

function resolveNextStage(
    stage: TrackerRuntimeDegradationStage,
    ignorePerformanceFallback: boolean | undefined,
): TrackerRuntimeDegradationStage {
    const nextStage =
        DEGRADATION_STAGES[Math.min(stageIndex(stage) + 1, DEGRADATION_STAGES.length - 1)];
    if (
        ignorePerformanceFallback === true &&
        (nextStage === "face-only" || nextStage === "comfortable-idle")
    ) {
        return stage;
    }
    return nextStage;
}

function resolvePreviousStage(
    stage: TrackerRuntimeDegradationStage,
): TrackerRuntimeDegradationStage {
    return DEGRADATION_STAGES[Math.max(stageIndex(stage) - 1, 0)];
}

function stageIndex(stage: TrackerRuntimeDegradationStage): number {
    return DEGRADATION_STAGES.indexOf(stage);
}

function canRecoverFromCurrentStage(
    stage: TrackerRuntimeDegradationStage,
    input: TrackerRuntimeDegradationPolicyInput,
): boolean {
    if (stage !== "face-only") {
        return true;
    }
    if (input.poseDetected !== true) {
        return false;
    }
    return (
        input.poseInferenceTimeMs !== undefined &&
        Number.isFinite(input.poseInferenceTimeMs) &&
        input.poseInferenceTimeMs <= 1000 / Math.max(1, input.profile.cadence.poseFps)
    );
}

function resolveEffectiveCadence(
    stage: TrackerRuntimeDegradationStage,
    profile: TrackerRuntimePerformanceProfile,
): TrackerRuntimeDegradationPolicyCadence {
    const cadence = { ...profile.cadence };
    if (stageIndex(stage) >= stageIndex("gesture-reduced-fps")) {
        cadence.gestureFps = Math.max(1, Math.floor(profile.cadence.gestureFps / 2));
    }
    if (stageIndex(stage) >= stageIndex("optional-pass-reduced-fps")) {
        cadence.handFps = Math.max(1, Math.floor(profile.cadence.handFps / 2));
        cadence.faceRoiFps = Math.max(1, Math.floor(profile.cadence.faceRoiFps / 2));
    }
    if (stageIndex(stage) >= stageIndex("pose-reduced-fps")) {
        cadence.poseFps = Math.max(2, Math.floor(profile.cadence.poseFps / 2));
    }
    if (stage === "face-only" || stage === "comfortable-idle") {
        cadence.poseFps = 0;
        cadence.handFps = 0;
        cadence.faceRoiFps = 0;
    }
    return cadence;
}

function clampCadenceForMainThreadFallback(
    cadence: TrackerRuntimeDegradationPolicyCadence,
): TrackerRuntimeDegradationPolicyCadence {
    const clamped = clampTrackerRuntimeTargetsForMainThreadFallback({
        targetInferenceFps: cadence.faceFps,
        targetPoseInferenceFps: Math.max(1, cadence.poseFps),
        targetHandInferenceFps: Math.max(1, cadence.handFps),
        targetFaceRoiInferenceFps: Math.max(1, cadence.faceRoiFps),
    });
    return {
        faceFps: clamped.targetInferenceFps,
        poseFps: cadence.poseFps === 0 ? 0 : clamped.targetPoseInferenceFps,
        handFps: cadence.handFps === 0 ? 0 : clamped.targetHandInferenceFps,
        faceRoiFps: cadence.faceRoiFps === 0 ? 0 : clamped.targetFaceRoiInferenceFps,
        gestureFps: cadence.gestureFps,
    };
}

function resolveTrackerDegradationState(
    stage: TrackerRuntimeDegradationStage,
): TrackerRuntimeDegradationState {
    if (stage === "pose-reduced-fps") {
        return "pose-reduced-fps";
    }
    if (stage === "face-only") {
        return "face-only";
    }
    if (stage === "comfortable-idle") {
        return "fallback";
    }
    return "full";
}

function resolveReasonCodes(
    stage: TrackerRuntimeDegradationStage,
    input: TrackerRuntimeDegradationPolicyInput,
): TrackerPerformanceReasonCode[] {
    const reasonCodes = new Set<TrackerPerformanceReasonCode>(input.budgetReasonCodes ?? []);
    for (const reason of input.roi?.reasonCodes ?? []) {
        reasonCodes.add(reason);
    }
    if (stageIndex(stage) >= stageIndex("roi-hand-paused")) {
        reasonCodes.add("hand_roi_paused");
    }
    if (stage === "pose-reduced-fps") {
        reasonCodes.add("pose_inference_warn");
    }
    if (stage === "face-only" || stage === "comfortable-idle") {
        reasonCodes.add("pose_detection_failed_repeatedly");
    }
    return [...reasonCodes];
}
