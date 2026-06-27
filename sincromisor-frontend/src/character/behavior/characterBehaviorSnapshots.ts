import type { SincroFaceMotionSnapshot } from "../../features/gaze/faceTracking/sincroFaceMotionSnapshot";
import {
    cloneSincroRoiObservation,
    DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
} from "../../features/gaze/faceTracking/sincroFaceMotionSnapshot";
import type {
    SincroPoseArmMotionSnapshot,
    SincroPoseMotionSnapshot,
} from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import { DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import type {
    CharacterBehaviorAiSpeechSnapshot,
    CharacterBehaviorGazeSnapshot,
    CharacterBehaviorSnapshot,
    CharacterBehaviorVadSnapshot,
    CharacterInteractionState,
    CharacterMotionPolicySnapshot,
    CharacterTalkMode,
} from "./characterBehaviorTypes";

type BuildCharacterBehaviorSnapshotOptions = {
    talkMode: CharacterTalkMode;
    motionPolicy: CharacterMotionPolicySnapshot;
    state: CharacterInteractionState;
    previousState: CharacterInteractionState;
    stateChangedAtMs: number;
    nowMs: number;
    vad: CharacterBehaviorVadSnapshot;
    gaze: CharacterBehaviorGazeSnapshot;
    faceMotion: SincroFaceMotionSnapshot;
    poseMotion: SincroPoseMotionSnapshot;
    aiSpeech: CharacterBehaviorAiSpeechSnapshot;
    errorMessage?: string;
};

export function createDefaultBehaviorVadSnapshot(): CharacterBehaviorVadSnapshot {
    return {
        isSpeech: false,
        rawIsSpeech: false,
        rms: 0,
        peak: 0,
        envelopeRms: 0,
        envelopePeak: 0,
        lastSpeechDurationMs: 0,
    };
}

export function createDefaultBehaviorGazeSnapshot(): CharacterBehaviorGazeSnapshot {
    return {
        trackingEnabled: false,
        detected: false,
        rawDetected: false,
        targetX: 0.5,
        targetY: 0.5,
        facing: 0.5,
        detectionCount: 0,
    };
}

export function createDefaultBehaviorFaceMotionSnapshot(): SincroFaceMotionSnapshot {
    return cloneFaceMotionSnapshot(DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT);
}

export function createDefaultBehaviorPoseMotionSnapshot(): SincroPoseMotionSnapshot {
    return clonePoseMotionSnapshot(DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT);
}

export function createDefaultBehaviorAiSpeechSnapshot(): CharacterBehaviorAiSpeechSnapshot {
    return {
        isSpeaking: false,
        currentLengthSeconds: 0,
        beatId: 0,
        beatIntensity: 0,
    };
}

export function buildCharacterBehaviorSnapshot(
    options: BuildCharacterBehaviorSnapshotOptions,
): CharacterBehaviorSnapshot {
    return {
        talkMode: options.talkMode,
        motionPolicy: options.motionPolicy,
        state: options.state,
        previousState: options.previousState,
        stateChangedAtMs: options.stateChangedAtMs,
        nowMs: options.nowMs,
        vad: { ...options.vad },
        gaze: { ...options.gaze },
        faceMotion: cloneFaceMotionSnapshot(options.faceMotion),
        poseMotion: clonePoseMotionSnapshot(options.poseMotion),
        aiSpeech: { ...options.aiSpeech },
        errorMessage: options.errorMessage,
    };
}

export function cloneFaceMotionSnapshot(
    snapshot: SincroFaceMotionSnapshot,
    nowMs?: number,
): SincroFaceMotionSnapshot {
    return {
        ...snapshot,
        headPose: { ...snapshot.headPose },
        blendshapes: { ...snapshot.blendshapes },
        roi: cloneSincroRoiObservation(snapshot.roi),
        warnings: [...snapshot.warnings],
        lastUpdatedAtMs: snapshot.lastUpdatedAtMs ?? nowMs,
    };
}

export function clonePoseMotionSnapshot(
    snapshot: SincroPoseMotionSnapshot,
    nowMs?: number,
): SincroPoseMotionSnapshot {
    return {
        ...snapshot,
        upperBody: { ...snapshot.upperBody },
        leftArm: clonePoseArmMotion(snapshot.leftArm),
        rightArm: clonePoseArmMotion(snapshot.rightArm),
        lastUpdatedAtMs: snapshot.lastUpdatedAtMs ?? nowMs,
    };
}

export function clonePoseArmMotion(
    snapshot: SincroPoseArmMotionSnapshot,
): SincroPoseArmMotionSnapshot {
    return {
        ...snapshot,
        targets: {
            shoulder: { ...snapshot.targets.shoulder },
            elbow: { ...snapshot.targets.elbow },
            wrist: { ...snapshot.targets.wrist },
        },
    };
}
