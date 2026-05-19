import type { Detection } from "@mediapipe/tasks-vision";
import type { CharacterGaze } from "../../characterGaze/characterGaze";
import type { SincroFaceMotionSnapshot } from "../../faceTracking/sincroFaceMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../../faceTracking/sincroPoseMotionSnapshot";
import type { ChatMessage, TelopChannelMessage } from "../../rtc/rtcMessage";
import { TalkManager, type TalkManagerEvent } from "../../rtc/talkManager";
import type { VadStateReport } from "../../rtc/userMediaManager";
import {
    applyTelopChannelMessageToAiSpeech,
    applyTextChannelMessageToAiSpeech,
    refreshAiSpeechFromCurrentMora,
} from "./characterBehaviorAiSpeech";
import {
    applyCharacterBehaviorGazeState,
    refreshStaleCharacterBehaviorGaze,
    setCharacterBehaviorGazeTrackingEnabled,
} from "./characterBehaviorGaze";
import {
    buildCharacterBehaviorSnapshot,
    cloneFaceMotionSnapshot,
    clonePoseMotionSnapshot,
    createDefaultBehaviorAiSpeechSnapshot,
    createDefaultBehaviorFaceMotionSnapshot,
    createDefaultBehaviorGazeSnapshot,
    createDefaultBehaviorPoseMotionSnapshot,
    createDefaultBehaviorVadSnapshot,
} from "./characterBehaviorSnapshots";
import {
    buildCharacterMotionPolicy,
    deriveCharacterInteractionState,
} from "./characterBehaviorStateDerivation";
import type {
    CharacterBehaviorAiSpeechSnapshot,
    CharacterBehaviorGazeSnapshot,
    CharacterBehaviorSnapshot,
    CharacterBehaviorVadSnapshot,
    CharacterInteractionState,
    CharacterTalkMode,
} from "./characterBehaviorTypes";
import { applyCharacterBehaviorVadReport } from "./characterBehaviorVad";

export type {
    CharacterBehaviorAiSpeechBeatKind,
    CharacterBehaviorAiSpeechSnapshot,
    CharacterBehaviorGazeSnapshot,
    CharacterBehaviorSnapshot,
    CharacterBehaviorVadSnapshot,
    CharacterInteractionState,
    CharacterMotionPolicySnapshot,
    CharacterMotionPrimaryInput,
    CharacterTalkMode,
} from "./characterBehaviorTypes";

// キャラクター表現が参照する入力状態の集約点。
// ボーン/表情 controller が個別に TalkManager や Gaze を購読し続けるとタイミング調整が分散するため、
// 後続の姿勢・目線・発話同期モーションはこの snapshot を正本として参照する。
export class CharacterBehaviorState {
    private static instance: CharacterBehaviorState;
    private talkMode: CharacterTalkMode = "chat";
    private talkModeChangedAtMs = performance.now();
    private previousState: CharacterInteractionState = "idle";
    private state: CharacterInteractionState = "idle";
    private stateChangedAtMs = performance.now();
    private errorMessage: string | undefined;
    private readonly errorMessagesBySource = new Map<string, string>();
    private readonly expressionCodeBySpeechId = new Map<number, number>();
    private lastUserSpeechEndedAtMs: number | undefined;
    private pendingRawSpeechStartedAtMs: number | undefined;
    private vad: CharacterBehaviorVadSnapshot = createDefaultBehaviorVadSnapshot();
    private gaze: CharacterBehaviorGazeSnapshot = createDefaultBehaviorGazeSnapshot();
    private faceMotion: SincroFaceMotionSnapshot = createDefaultBehaviorFaceMotionSnapshot();
    private poseMotion: SincroPoseMotionSnapshot = createDefaultBehaviorPoseMotionSnapshot();
    private aiSpeech: CharacterBehaviorAiSpeechSnapshot = createDefaultBehaviorAiSpeechSnapshot();

    static getManager(): CharacterBehaviorState {
        if (!CharacterBehaviorState.instance) {
            CharacterBehaviorState.instance = new CharacterBehaviorState();
        }
        return CharacterBehaviorState.instance;
    }

    private constructor() {
        TalkManager.getManager().subscribe((event) => {
            this.applyTalkManagerEvent(event);
        });
    }

    applyVadState(report: VadStateReport, nowMs: number = performance.now()): void {
        const update = applyCharacterBehaviorVadReport({
            report,
            currentVad: this.vad,
            pendingRawSpeechStartedAtMs: this.pendingRawSpeechStartedAtMs,
            lastUserSpeechEndedAtMs: this.lastUserSpeechEndedAtMs,
            nowMs,
        });
        this.vad = update.vad;
        this.pendingRawSpeechStartedAtMs = update.pendingRawSpeechStartedAtMs;
        this.lastUserSpeechEndedAtMs = update.lastUserSpeechEndedAtMs;
    }

    applyGazeState(
        characterGaze: CharacterGaze,
        detections: Detection[],
        nowMs: number = performance.now(),
    ): void {
        this.gaze = applyCharacterBehaviorGazeState({
            characterGaze,
            detections,
            currentGaze: this.gaze,
            nowMs,
        });
    }

    setGazeTrackingEnabled(enabled: boolean, nowMs: number = performance.now()): void {
        this.gaze = setCharacterBehaviorGazeTrackingEnabled(this.gaze, enabled, nowMs);
    }

    applyFaceMotion(snapshot: SincroFaceMotionSnapshot, nowMs: number = performance.now()): void {
        this.faceMotion = cloneFaceMotionSnapshot(snapshot, nowMs);
    }

    applyPoseMotion(snapshot: SincroPoseMotionSnapshot, nowMs: number = performance.now()): void {
        this.poseMotion = clonePoseMotionSnapshot(snapshot, nowMs);
    }

    setTalkMode(mode: string, nowMs: number = performance.now()): void {
        const nextMode = this.normalizeTalkMode(mode);
        if (nextMode === this.talkMode) {
            return;
        }

        this.talkMode = nextMode;
        this.talkModeChangedAtMs = nowMs;
        this.lastUserSpeechEndedAtMs = undefined;
        this.pendingRawSpeechStartedAtMs = undefined;

        // mode切替直後は古い入力状態を残さない。trackerの実停止/起動はApp層が担当する。
        if (nextMode === "sincro") {
            this.setGazeTrackingEnabled(false, nowMs);
        } else {
            this.setFaceMotionTrackingEnabled(false, nowMs);
            this.setPoseMotionTrackingEnabled(false, nowMs);
        }
        this.update(nowMs);
    }

    setFaceMotionTrackingEnabled(enabled: boolean, nowMs: number = performance.now()): void {
        this.faceMotion = {
            ...this.faceMotion,
            trackingEnabled: enabled,
            detected: enabled ? this.faceMotion.detected : false,
            confidence: enabled ? this.faceMotion.confidence : 0,
            fallbackReason: enabled ? this.faceMotion.fallbackReason : undefined,
            lastUpdatedAtMs: nowMs,
        };
    }

    setPoseMotionTrackingEnabled(enabled: boolean, nowMs: number = performance.now()): void {
        this.poseMotion = {
            ...this.poseMotion,
            trackingEnabled: enabled,
            detected: enabled ? this.poseMotion.detected : false,
            confidence: enabled ? this.poseMotion.confidence : 0,
            fallbackReason: enabled ? this.poseMotion.fallbackReason : undefined,
            degradedToFaceOnly: enabled ? this.poseMotion.degradedToFaceOnly : false,
            lastUpdatedAtMs: nowMs,
        };
    }

    setError(message: string | undefined, nowMs: number = performance.now()): void {
        if (message === undefined) {
            this.clearErrorSource("general", nowMs);
            return;
        }
        this.setErrorSource("general", message, nowMs);
    }

    setErrorSource(source: string, message: string, nowMs: number = performance.now()): void {
        if (message) {
            this.errorMessagesBySource.set(source, message);
        } else {
            this.errorMessagesBySource.delete(source);
        }
        this.errorMessage = this.currentErrorMessage();
        this.update(nowMs);
    }

    clearErrorSource(source: string, nowMs: number = performance.now()): void {
        this.errorMessagesBySource.delete(source);
        this.errorMessage = this.currentErrorMessage();
        this.update(nowMs);
    }

    update(nowMs: number = performance.now()): CharacterBehaviorSnapshot {
        this.refreshGazeStaleness(nowMs);
        this.refreshAiSpeechFromCurrentMora(nowMs);
        const nextState = this.deriveState(nowMs);
        if (nextState !== this.state) {
            this.previousState = this.state;
            this.state = nextState;
            this.stateChangedAtMs = nowMs;
        }
        return this.getSnapshot(nowMs);
    }

    getSnapshot(nowMs: number = performance.now()): CharacterBehaviorSnapshot {
        const motionPolicy = this.buildMotionPolicy(nowMs);
        return buildCharacterBehaviorSnapshot({
            talkMode: this.talkMode,
            motionPolicy,
            state: this.state,
            previousState: this.previousState,
            stateChangedAtMs: this.stateChangedAtMs,
            nowMs,
            vad: this.vad,
            gaze: this.gaze,
            faceMotion: this.faceMotion,
            poseMotion: this.poseMotion,
            aiSpeech: this.aiSpeech,
            errorMessage: this.errorMessage,
        });
    }

    private applyTalkManagerEvent(event: TalkManagerEvent): void {
        const nowMs = performance.now();
        if (event.type === "text_channel_message") {
            this.applyTextChannelMessage(event.message, nowMs);
            return;
        }
        this.applyTelopChannelMessage(event.message, nowMs);
    }

    private applyTextChannelMessage(message: ChatMessage, nowMs: number): void {
        this.aiSpeech = applyTextChannelMessageToAiSpeech({
            message,
            currentAiSpeech: this.aiSpeech,
            expressionCodeBySpeechId: this.expressionCodeBySpeechId,
            nowMs,
        });
    }

    private applyTelopChannelMessage(message: TelopChannelMessage, nowMs: number): void {
        this.aiSpeech = applyTelopChannelMessageToAiSpeech({
            message,
            currentAiSpeech: this.aiSpeech,
            expressionCodeBySpeechId: this.expressionCodeBySpeechId,
            nowMs,
        });
    }

    private refreshAiSpeechFromCurrentMora(nowMs: number): void {
        this.aiSpeech = refreshAiSpeechFromCurrentMora({
            currentMora: TalkManager.getManager().currentMora(),
            currentAiSpeech: this.aiSpeech,
            expressionCodeBySpeechId: this.expressionCodeBySpeechId,
            nowMs,
        });
    }

    private deriveState(nowMs: number): CharacterInteractionState {
        return deriveCharacterInteractionState({
            talkMode: this.talkMode,
            errorMessage: this.errorMessage,
            aiSpeech: this.aiSpeech,
            vad: this.vad,
            gaze: this.gaze,
            faceMotion: this.faceMotion,
            lastUserSpeechEndedAtMs: this.lastUserSpeechEndedAtMs,
            nowMs,
        });
    }

    private buildMotionPolicy(nowMs: number) {
        return buildCharacterMotionPolicy({
            talkMode: this.talkMode,
            talkModeChangedAtMs: this.talkModeChangedAtMs,
            poseMotion: this.poseMotion,
            nowMs,
        });
    }

    private normalizeTalkMode(mode: string): CharacterTalkMode {
        return mode === "sincro" ? "sincro" : "chat";
    }

    private refreshGazeStaleness(nowMs: number): void {
        this.gaze = refreshStaleCharacterBehaviorGaze(this.gaze, nowMs);
    }

    private currentErrorMessage(): string | undefined {
        const first = this.errorMessagesBySource.values().next();
        return first.done ? undefined : first.value;
    }
}
