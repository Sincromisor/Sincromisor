/**
 * MotionReplayPlayer と scene / tracker bridge を接続する replay lifecycle owner。
 * replay stop は timer と applied pose state を必ず閉じ、camera / recording runtime の resource は所有しない。
 */
import type { CharacterBehaviorState } from "../../character/behavior/characterBehaviorState";
import {
    type CanonicalUpperBodyState,
    parseCanonicalUpperBodyState,
} from "../../character/canonical/canonicalUpperBodyState";
import type {
    SincroMotionDebugFrame,
    SincroMotionDebugLogManifest,
} from "../../character/motionEvaluation/motionDebugLogSchema";
import type { MotionReplayApplyContext } from "../../character/motionEvaluation/motionReplayPlayer";
import { MotionReplayPlayer } from "../../character/motionEvaluation/motionReplayPlayer";
import { MotionIntentEstimator } from "../../character/motionIntent/motionIntentEstimator";
import type { MotionIntentState } from "../../character/motionIntent/motionIntentState";
import { parseMotionPostProcessingResult } from "../../character/motionPostProcessing/motionPostProcessingState";
import { TemporalStateEstimator } from "../../character/temporal/temporalStateEstimator";
import { parseTemporalUpperBodyState } from "../../character/temporal/temporalUpperBodyState";
import type { DebugConsoleManager } from "../../features/debug/model/debugConsoleManager";
import type { SincroPoseMotionSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import {
    createMotionDebugCanonicalReliabilityInput,
    createMotionDebugCanonicalState,
} from "./motionDebugCanonicalState";
import { readMotionDebugReplayText } from "./motionDebugReplayInput";
import { MotionDebugReplayTimer } from "./motionDebugReplayTimer";
import type { MotionDebugSceneRuntime } from "./motionDebugSceneRuntime";
import type { MotionDebugTrackerBridge } from "./motionDebugTrackerBridge";
import type {
    MotionDebugReplayFrameResult,
    MotionDebugReplayLoadResult,
    MotionDebugReplayState,
    MotionDebugSnapshot,
    MotionDebugStatus,
} from "./types";

type MotionDebugReplayRuntimeParams = {
    tracker: MotionDebugTrackerBridge;
    behaviorState: CharacterBehaviorState;
    debugConsole: DebugConsoleManager;
    scene: MotionDebugSceneRuntime;
    getSnapshot: () => MotionDebugSnapshot;
    setStatus: (status: MotionDebugStatus, message: string) => void;
    stopActiveRuntime: (reason: string) => void;
    setAutoViewerMode: (mode: "replay") => void;
    renderSnapshot: () => void;
};

export class MotionDebugReplayRuntime {
    // reason: structure-threshold-exception replay playback and replay-derived temporal/intent reset timing remain grouped to preserve behavior.
    readonly player: MotionReplayPlayer<MotionDebugSnapshot>;
    private readonly temporalEstimator = new TemporalStateEstimator();
    private readonly intentEstimator = new MotionIntentEstimator();
    private readonly timer: MotionDebugReplayTimer;
    private latestCanonical?: MotionDebugSnapshot["canonical"];
    private latestTemporal?: MotionDebugSnapshot["temporal"];
    private latestIntent?: MotionIntentState;
    private latestPostProcessing?: MotionDebugSnapshot["postProcessing"];
    private latestCanonicalReliabilityInput?: MotionDebugSnapshot["canonicalReliabilityInput"];

    constructor(private readonly params: MotionDebugReplayRuntimeParams) {
        this.player = new MotionReplayPlayer<MotionDebugSnapshot>({
            applyPoseSnapshot: (snapshot, context) =>
                this.applyReplayPoseSnapshot(snapshot, context),
            readSnapshot: () => this.params.getSnapshot(),
        });
        this.timer = new MotionDebugReplayTimer({
            frameCount: () => this.player.frameCount(),
            frameMediaTimeMs: (frameIndex) => this.player.frameMediaTimeMs(frameIndex),
            stepReplay: (frameIndex) => this.player.stepReplay(frameIndex, { autoplay: true }),
            stopReplay: () => this.stopReplay(),
            setStatus: (status, message) => {
                this.params.setStatus(status, message);
            },
            renderSnapshot: () => {
                this.params.renderSnapshot();
            },
        });
    }

    async loadRecording(fileOrText: unknown): Promise<MotionDebugReplayLoadResult> {
        this.clearTimer();
        const textInput = await readMotionDebugReplayText(fileOrText);
        if (!textInput.ok) {
            return textInput;
        }

        const result = this.player.loadRecordingText(textInput.text);
        this.resetCanonicalState();
        this.params.tracker.resetReliabilityState();
        this.resetTemporalState();
        if (result.ok) {
            this.params.stopActiveRuntime("motion_debug_replay_loaded");
            this.params.setStatus("stopped", "replay 読み込み済み");
        } else {
            this.params.setStatus("error", result.message);
        }
        this.params.renderSnapshot();
        return result;
    }

    startReplay(options: {
        mode: NonNullable<MotionDebugReplayState["mode"]>;
        autoplay?: boolean;
    }): MotionDebugReplayFrameResult {
        this.clearTimer();
        this.params.stopActiveRuntime("motion_debug_replay_started");
        this.params.behaviorState.setTalkMode("sincro");
        const result = this.player.startReplay({
            mode: options.mode,
            autoplay: options.autoplay,
        });
        if (result.ok) {
            // replay mode は実カメラを止め、保存済み frame を表示へ適用する開発者境界。
            this.params.setAutoViewerMode("replay");
        }
        this.timer.updateReplayStatus(result, options.autoplay === true);
        if (result.ok && options.autoplay === true) {
            this.timer.scheduleNextFrame(result.frameIndex);
        }
        this.params.renderSnapshot();
        return result;
    }

    stepReplay(frameIndex: number): MotionDebugReplayFrameResult {
        this.clearTimer();
        const result = this.player.stepReplay(frameIndex);
        this.timer.updateReplayStatus(result, false);
        this.params.renderSnapshot();
        return result;
    }

    stopReplay(): MotionDebugReplayState {
        this.clearTimer();
        const state = this.player.stopReplay();
        this.resetTemporalState();
        this.params.setStatus("stopped", "replay 停止中");
        this.params.renderSnapshot();
        return state;
    }

    getReplayState(): MotionDebugReplayState {
        return this.player.getReplayState();
    }

    resetCanonicalState(): void {
        this.latestCanonical = undefined;
        this.latestCanonicalReliabilityInput = undefined;
    }

    resetTemporalState(): void {
        this.latestTemporal = undefined;
        this.latestIntent = undefined;
        this.latestPostProcessing = undefined;
        this.temporalEstimator.reset();
        this.intentEstimator.reset();
    }

    setCanonicalState(state: MotionDebugSnapshot["canonical"]): void {
        this.latestCanonical = state;
    }

    setCanonicalReliabilityInput(state: MotionDebugSnapshot["canonicalReliabilityInput"]): void {
        this.latestCanonicalReliabilityInput = state;
    }

    setTemporalState(state: MotionDebugSnapshot["temporal"]): void {
        this.latestTemporal = state;
    }

    setIntentState(state: MotionIntentState | undefined): void {
        this.latestIntent = state;
    }

    setPostProcessingState(state: MotionDebugSnapshot["postProcessing"]): void {
        this.latestPostProcessing = state;
    }

    snapshotState(): Pick<
        MotionDebugSnapshot,
        "canonical" | "temporal" | "intent" | "postProcessing" | "canonicalReliabilityInput"
    > {
        return {
            canonical: this.latestCanonical,
            temporal: this.latestTemporal,
            intent: this.latestIntent,
            postProcessing: this.latestPostProcessing,
            canonicalReliabilityInput: this.latestCanonicalReliabilityInput,
        };
    }

    latestValidCanonical(): CanonicalUpperBodyState | undefined {
        const canonical = this.latestCanonical;
        if (canonical === undefined || "parseStatus" in canonical) {
            return undefined;
        }
        return canonical;
    }

    replayFrames(): readonly SincroMotionDebugFrame[] {
        return this.player.replayFrames();
    }

    replayManifest(): SincroMotionDebugLogManifest | undefined {
        return this.player.replayManifest();
    }

    createReplayLogText(replayManifest: SincroMotionDebugLogManifest): string {
        return [
            JSON.stringify({ recordType: "manifest", manifest: replayManifest }),
            ...this.player
                .replayFrames()
                .map((frame) => JSON.stringify({ recordType: "frame", frame })),
        ].join("\n");
    }

    clearTimer(): void {
        this.timer.clear();
    }

    private applyReplayPoseSnapshot(
        snapshot: SincroPoseMotionSnapshot,
        context: MotionReplayApplyContext,
    ): MotionDebugSnapshot {
        const previousPose = this.params.tracker.setPoseSnapshot(snapshot);
        this.params.tracker.updateReplayReliability(
            snapshot,
            previousPose,
            context.frame.reliability,
            context.mediaTimeMs,
            context.frame.video,
        );
        this.updateReplayCanonical(snapshot, context);
        this.updateReplayTemporal(context);
        this.updateReplayIntent(context);
        this.updateReplayPostProcessing(context);
        this.params.tracker.applyReplayPoseSnapshot(snapshot, context.mediaTimeMs, () => {
            this.params.scene.renderOnce(context.mediaTimeMs);
        });
        return this.params.getSnapshot();
    }

    private updateReplayCanonical(
        snapshot: SincroPoseMotionSnapshot,
        context: MotionReplayApplyContext,
    ): void {
        if (context.frame.canonical !== undefined) {
            const parsed = parseCanonicalUpperBodyState(context.frame.canonical);
            this.latestCanonical = parsed.ok
                ? parsed.state
                : {
                      parseStatus: "invalid",
                      errors: parsed.errors,
                      raw: context.frame.canonical,
                  };
            this.latestCanonicalReliabilityInput = createMotionDebugCanonicalReliabilityInput(
                this.params.tracker.latestValidReliability(),
            );
            return;
        }

        const reliability = this.params.tracker.latestValidReliability();
        this.latestCanonical = createMotionDebugCanonicalState({
            pose: snapshot,
            face: this.params.tracker.snapshotState().face,
            previous: this.latestValidCanonical(),
            mediaTimeMs: context.mediaTimeMs,
            reliability,
        });
        this.latestCanonicalReliabilityInput =
            createMotionDebugCanonicalReliabilityInput(reliability);
    }

    private updateReplayTemporal(context: MotionReplayApplyContext): void {
        if (context.frame.temporal !== undefined) {
            const parsed = parseTemporalUpperBodyState(context.frame.temporal);
            this.latestTemporal = parsed.ok
                ? parsed.state
                : { parseStatus: "invalid", errors: parsed.errors, raw: context.frame.temporal };
            return;
        }
        const canonical = this.latestValidCanonical();
        this.latestTemporal =
            canonical === undefined
                ? undefined
                : this.temporalEstimator.update({
                      canonical,
                      reliability: this.params.tracker.latestValidReliability(),
                      mediaTimeMs: context.mediaTimeMs,
                  });
    }

    private updateReplayIntent(context: MotionReplayApplyContext): void {
        const temporal = this.latestTemporal;
        if (temporal === undefined || "parseStatus" in temporal) {
            this.latestIntent = undefined;
            return;
        }
        this.latestIntent = this.intentEstimator.update({
            temporal,
            reliability: this.params.tracker.latestValidReliability(),
            hand: this.params.tracker.snapshotState().hand,
            mediaTimeMs: context.mediaTimeMs,
        });
    }

    private updateReplayPostProcessing(context: MotionReplayApplyContext): void {
        if (context.frame.postProcessing !== undefined) {
            const parsed = parseMotionPostProcessingResult(context.frame.postProcessing);
            this.latestPostProcessing = parsed.ok
                ? parsed.result
                : {
                      parseStatus: "invalid",
                      errors: parsed.errors,
                      raw: context.frame.postProcessing,
                  };
            return;
        }
        this.latestPostProcessing = undefined;
    }
}
