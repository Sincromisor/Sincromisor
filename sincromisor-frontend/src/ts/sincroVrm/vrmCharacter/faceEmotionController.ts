import type { VRMExpressionManager, VRMExpressionPresetName } from "@pixiv/three-vrm";
import { DebugConsoleManager } from "../../ui/debugConsoleManager";
import type { CharacterBehaviorSnapshot } from "./characterBehaviorState";

type EmotionPreset = "neutral" | "relaxed" | "happy" | "sad" | "angry" | "surprised";

type EmotionPlaybackOptions = {
    preset: EmotionPreset;
    intensity: number;
    holdMs: number;
    transitionMs: number;
    nowMs: number;
};

type ExpressionWithBinds = {
    binds: unknown[];
};

type ExpressionWithMutableBinds = ExpressionWithBinds & {
    deleteBind: (bind: unknown) => void;
};

// text_ch の ChatMessage.expression_code (先頭 ^N) を受け取り、
// VRM標準表情プリセットを短時間だけ適用する controller。
//
// 設計意図:
// - 汎用VRM対応を優先し、モデルごとに名前が異なる個別morph（眉/目）を直接叩かない
// - その代わり、標準プリセット(happy/sad/...)を使い、口パクvisemeとの重複morph bindだけ除去して
//   口表現との干渉を最小化する（完全分離ではなく、汎用性重視の折衷）
export class FaceEmotionController {
    private readonly expressionManager: VRMExpressionManager;
    private readonly logger: DebugConsoleManager;
    private handledMessageId: string | undefined;
    private neutralizedSpeechId: number | undefined;
    private activeEmotion:
        | {
              preset: EmotionPreset;
              intensity: number;
              startMs: number;
              fadeInMs: number;
              fadeOutStartMs: number;
              endMs: number;
          }
        | undefined;
    private readonly animatedPresets: EmotionPreset[] = [
        "relaxed",
        "happy",
        "sad",
        "angry",
        "surprised",
    ];

    constructor(expressionManager: VRMExpressionManager) {
        this.expressionManager = expressionManager;
        this.logger = DebugConsoleManager.getManager();
        // 口パク(aa/ih/...)と同じ morph target を感情プリセットが触るVRMでは、
        // 表情と口の競合で破綻しやすい。初期化時に重複bindを除去して干渉を減らす。
        this.detachEmotionBindsOverlappingMouthVisemes();
        // モデル差で感情プリセット未実装のことがあるため、起動時に一覧を出しておく。
        this.logAvailableExpressions();
        this.logger.addTextChannelLog("[emotion] FaceEmotionController initialized\n");
    }

    // 感情表情も CharacterBehaviorSnapshot を正本にし、text_ch/telop_ch の順序差を状態層へ閉じ込める。
    update(snapshot: CharacterBehaviorSnapshot): void {
        if (!snapshot.motionPolicy.allowAiEmotion) {
            this.activeEmotion = undefined;
            this.setEmotionPresetValues("neutral", 0.0);
            return;
        }

        const speechId = snapshot.aiSpeech.speechId;
        if (
            snapshot.aiSpeech.isSpeaking &&
            speechId !== undefined &&
            snapshot.aiSpeech.expressionCode === undefined &&
            speechId !== this.neutralizedSpeechId
        ) {
            this.neutralizedSpeechId = speechId;
            this.playEmotion({
                preset: "neutral",
                intensity: 0.0,
                holdMs: 0,
                transitionMs: 1,
                nowMs: snapshot.nowMs,
            });
        }

        const msg = snapshot.aiSpeech.lastTextMessage;
        if (!msg || msg.message_type !== "system") {
            this.updateEmotionAnimation(snapshot.nowMs);
            return;
        }
        if (speechId !== undefined && msg.speech_id !== speechId) {
            this.updateEmotionAnimation(snapshot.nowMs);
            return;
        }

        // 同一 message_id のストリーミング更新で表情を再トリガーしない。
        if (msg.message_id === this.handledMessageId) {
            this.updateEmotionAnimation(snapshot.nowMs);
            return;
        }
        this.handledMessageId = msg.message_id;

        const code = typeof msg.expression_code === "number" ? msg.expression_code : 0;
        const preset = this.mapExpressionCode(code);
        const intensity = this.defaultIntensity(code);
        const holdMs = code === 5 ? 700 : 2200;
        const transitionMs = code === 5 ? 120 : 180;
        const expression = this.expressionManager.getExpression(preset) ?? undefined;
        const presetExists = expression !== undefined;
        // 同じコードでもVRMごとに見え方がかなり違うため、実機調整しやすいよう
        // 適用先プリセット名と強度をログに残す。
        this.logger.addTextChannelLog(
            `[emotion] apply message_id=${msg.message_id} code=${code} preset=${preset} exists=${presetExists} intensity=${intensity.toFixed(2)}\n`,
        );
        this.playEmotion({ preset, intensity, holdMs, transitionMs, nowMs: snapshot.nowMs });
        this.updateEmotionAnimation(snapshot.nowMs);
    }

    private mapExpressionCode(code: number): EmotionPreset {
        switch (code) {
            case 1:
                return "relaxed";
            case 2:
                return "sad";
            case 3:
                return "angry";
            case 4:
                return "happy";
            case 5:
                return "surprised";
            default:
                return "neutral";
        }
    }

    private defaultIntensity(code: number): number {
        switch (code) {
            case 1:
                return 0.28;
            case 2:
                return 0.32;
            case 3:
                return 0.38;
            case 4:
                return 0.34;
            case 5:
                return 0.46;
            default:
                return 0.0;
        }
    }

    private playEmotion({
        preset,
        intensity,
        holdMs,
        transitionMs,
        nowMs,
    }: EmotionPlaybackOptions): void {
        // 新しい応答が来たら前の感情アニメーションを打ち切り、最新応答を優先する。
        const startMs = nowMs;
        const fadeInMs = Math.max(transitionMs, 1);
        const fadeOutStartMs = startMs + fadeInMs + Math.max(holdMs, 0);
        const endMs = fadeOutStartMs + fadeInMs;

        if (preset === "neutral") {
            this.activeEmotion = undefined;
            this.setEmotionPresetValues("neutral", 0.0);
            return;
        }

        this.activeEmotion = { preset, intensity, startMs, fadeInMs, fadeOutStartMs, endMs };
    }

    private updateEmotionAnimation(nowMs: number): void {
        if (!this.activeEmotion) {
            return;
        }

        const animation = this.activeEmotion;
        let value = 0.0;
        if (nowMs < animation.startMs + animation.fadeInMs) {
            value = animation.intensity * ((nowMs - animation.startMs) / animation.fadeInMs);
        } else if (nowMs < animation.fadeOutStartMs) {
            value = animation.intensity;
        } else if (nowMs < animation.endMs) {
            value =
                animation.intensity *
                (1.0 - (nowMs - animation.fadeOutStartMs) / animation.fadeInMs);
        } else {
            this.setEmotionPresetValues(animation.preset, 0.0);
            this.activeEmotion = undefined;
            return;
        }

        this.setEmotionPresetValues(animation.preset, Math.max(0.0, Math.min(1.0, value)));
    }

    private setEmotionPresetValues(targetPreset: EmotionPreset, value: number): void {
        // 1つの感情プリセットだけを有効にし、他感情の残留値で顔が混ざるのを防ぐ。
        for (const preset of this.animatedPresets) {
            this.expressionManager.setValue(preset, preset === targetPreset ? value : 0.0);
        }
    }

    private logAvailableExpressions(): void {
        const expressionMap = this.expressionManager.expressionMap;
        const names = Object.keys(expressionMap).sort();
        const required = ["neutral", "relaxed", "happy", "sad", "angry", "surprised"];
        const availability = required
            .map((name) => `${name}:${names.includes(name) ? "yes" : "no"}`)
            .join(", ");
        const expressionList = names.length === 0 ? "(none)" : names.join(", ");
        this.logger.addTextChannelLog(`[emotion] available expressions: ${expressionList}\n`);
        this.logger.addTextChannelLog(`[emotion] preset availability: ${availability}\n`);
    }

    private detachEmotionBindsOverlappingMouthVisemes(): void {
        // three-vrm の expression bind から morph target の識別子（primitive uuid + morph index）を抜き出し、
        // 口パク用visemeと感情プリセットが同じ morph を共有している場合のみ感情側 bind を外す。
        // これにより、モデル差が大きい「目/眉個別morph名」の知識を持たなくても競合を減らせる。
        const mouthMorphBindKeys = this.collectMouthMorphBindKeys();
        if (mouthMorphBindKeys.size === 0) {
            this.logger.addTextChannelLog(
                "[emotion] mouth-viseme morph bind overlap check skipped (no viseme morph binds)\n",
            );
            return;
        }

        let removedBindCount = 0;
        for (const preset of this.animatedPresets) {
            removedBindCount += this.detachOverlappingEmotionBinds(preset, mouthMorphBindKeys);
        }

        this.logger.addTextChannelLog(
            `[emotion] detached ${removedBindCount} emotion morph binds overlapping mouth visemes\n`,
        );
    }

    private collectMouthMorphBindKeys(): Set<string> {
        const visemePresets: VRMExpressionPresetName[] = ["aa", "ih", "ou", "oh", "ee"];
        const mouthMorphBindKeys = new Set<string>();
        for (const preset of visemePresets) {
            const expression = this.expressionManager.getExpression(preset) ?? undefined;
            if (!hasExpressionBinds(expression)) {
                continue;
            }
            for (const bind of expression.binds) {
                for (const key of this.extractMorphBindKeys(bind)) {
                    mouthMorphBindKeys.add(key);
                }
            }
        }
        return mouthMorphBindKeys;
    }

    private detachOverlappingEmotionBinds(
        preset: EmotionPreset,
        mouthMorphBindKeys: Set<string>,
    ): number {
        const expression = this.expressionManager.getExpression(preset) ?? undefined;
        if (!hasMutableExpressionBinds(expression)) {
            return 0;
        }
        let removedBindCount = 0;
        // deleteBind() で配列が変化するため、スナップショットを走査する。
        for (const bind of [...expression.binds]) {
            const bindKeys = this.extractMorphBindKeys(bind);
            if (bindKeys.some((key) => mouthMorphBindKeys.has(key))) {
                expression.deleteBind(bind);
                removedBindCount += 1;
            }
        }
        return removedBindCount;
    }

    private extractMorphBindKeys(bind: unknown): string[] {
        // MorphTargetBind だけを対象にし、Material/Texture系 bind はここでは干渉対象にしない。
        if (!bind || typeof bind !== "object" || !("index" in bind) || !("primitives" in bind)) {
            return [];
        }
        if (typeof bind.index !== "number" || !Array.isArray(bind.primitives)) {
            return [];
        }
        return bind.primitives
            .map((primitive) => primitiveUuid(primitive))
            .filter((uuid): uuid is string => uuid !== undefined)
            .map((uuid) => `${uuid}:${bind.index}`);
    }
}

function hasExpressionBinds(value: unknown): value is ExpressionWithBinds {
    return !!value && typeof value === "object" && "binds" in value && Array.isArray(value.binds);
}

function hasMutableExpressionBinds(value: unknown): value is ExpressionWithMutableBinds {
    return (
        hasExpressionBinds(value) && "deleteBind" in value && typeof value.deleteBind === "function"
    );
}

function primitiveUuid(value: unknown): string | undefined {
    if (!value || typeof value !== "object" || !("uuid" in value)) {
        return undefined;
    }
    return typeof value.uuid === "string" ? value.uuid : undefined;
}
