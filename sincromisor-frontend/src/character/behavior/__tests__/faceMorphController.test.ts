import type { VRMExpressionManager, VRMExpressionPresetName } from "@pixiv/three-vrm";
import { describe, expect, it } from "vitest";
import type { SincroFaceRetargetFrame } from "../../retargeting/sincroFaceRetargeter";
import {
    buildCharacterBehaviorSnapshot,
    createDefaultBehaviorAiSpeechSnapshot,
    createDefaultBehaviorFaceMotionSnapshot,
    createDefaultBehaviorGazeSnapshot,
    createDefaultBehaviorPoseMotionSnapshot,
    createDefaultBehaviorVadSnapshot,
} from "../characterBehaviorSnapshots";
import { buildCharacterMotionPolicy } from "../characterBehaviorStateDerivation";
import type {
    CharacterBehaviorAiSpeechSnapshot,
    CharacterBehaviorSnapshot,
} from "../characterBehaviorTypes";
import { FaceMorphController } from "../faceMorphController";

const MOUTH_PRESETS: VRMExpressionPresetName[] = ["aa", "ih", "ou", "oh", "ee"];

describe("FaceMorphController", () => {
    it("sincro モードでも AI リップシンクを許可する", () => {
        const policy = buildCharacterMotionPolicy({
            talkMode: "sincro",
            talkModeChangedAtMs: 0,
            poseMotion: createDefaultBehaviorPoseMotionSnapshot(),
            nowMs: 1000,
        });

        expect(policy.allowAiLipSync).toBe(true);
    });

    it("AI 発話中はカメラ口形より母音口形を優先する", () => {
        const { controller, values } = createController();
        const speech = {
            ...createDefaultBehaviorAiSpeechSnapshot(),
            isSpeaking: true,
            currentMoraId: 1,
            currentVowel: "A",
            currentLengthSeconds: 0.1,
        };

        controller.update(createSnapshot(0, speech), cameraMouth());
        controller.update(createSnapshot(50, speech), cameraMouth());

        expect(Object.fromEntries(values)).toEqual({ aa: 1, ih: 0, ou: 0, oh: 0, ee: 0 });
    });

    it("AI 発話中に母音が未着でもカメラ口形へ戻さない", () => {
        const { controller, values } = createController();

        controller.update(
            createSnapshot(0, {
                ...createDefaultBehaviorAiSpeechSnapshot(),
                isSpeaking: true,
            }),
            cameraMouth(),
        );

        expect(Object.fromEntries(values)).toEqual({ aa: 0, ih: 0, ou: 0, oh: 0, ee: 0 });
    });

    it("AI が発話していない間はカメラ口形を適用する", () => {
        const { controller, values } = createController();

        controller.update(createSnapshot(0), cameraMouth());

        expect(Object.fromEntries(values)).toEqual({
            aa: 0.1,
            ih: 0.2,
            ou: 0.3,
            oh: 0.4,
            ee: 0.5,
        });
    });
});

function createController(): {
    controller: FaceMorphController;
    values: Map<VRMExpressionPresetName, number>;
} {
    const values = new Map<VRMExpressionPresetName, number>();
    const expressionManager = {
        getExpression: (preset: VRMExpressionPresetName) =>
            MOUTH_PRESETS.includes(preset) ? {} : undefined,
        setValue: (preset: VRMExpressionPresetName, value: number) => values.set(preset, value),
    } as unknown as VRMExpressionManager;
    return { controller: new FaceMorphController(expressionManager), values };
}

function createSnapshot(
    nowMs: number,
    aiSpeech: CharacterBehaviorAiSpeechSnapshot = createDefaultBehaviorAiSpeechSnapshot(),
): CharacterBehaviorSnapshot {
    return buildCharacterBehaviorSnapshot({
        talkMode: "sincro",
        motionPolicy: {
            talkMode: "sincro",
            primaryInput: "faceMotion",
            neutralTransition: false,
            allowGazeMotion: false,
            allowFaceRetarget: true,
            allowPoseRetarget: false,
            allowAiSpeechGesture: false,
            allowAiLipSync: true,
            allowAiEmotion: false,
            allowThinkingAversion: false,
            idleMotionScale: 0.42,
        },
        state: "attending",
        previousState: "attending",
        stateChangedAtMs: 0,
        nowMs,
        vad: createDefaultBehaviorVadSnapshot(),
        gaze: createDefaultBehaviorGazeSnapshot(),
        faceMotion: {
            ...createDefaultBehaviorFaceMotionSnapshot(),
            trackingEnabled: true,
            detected: true,
            confidence: 1,
        },
        poseMotion: createDefaultBehaviorPoseMotionSnapshot(),
        aiSpeech,
    });
}

function cameraMouth(): SincroFaceRetargetFrame {
    return {
        active: true,
        confidence: 1,
        head: {
            upperChest: { x: 0, y: 0, z: 0 },
            neck: { x: 0, y: 0, z: 0 },
            head: { x: 0, y: 0, z: 0 },
        },
        expressions: {
            blink: 0,
            blinkLeft: 0,
            blinkRight: 0,
            lookLeft: 0,
            lookRight: 0,
            lookUp: 0,
            lookDown: 0,
            aa: 0.1,
            ih: 0.2,
            ou: 0.3,
            oh: 0.4,
            ee: 0.5,
        },
    };
}
