import { VRMExpressionManager, VRMExpressionPresetName } from "@pixiv/three-vrm";
import { TalkManager, TalkManagerEvent } from "../../RTC/TalkManager";
import { DebugConsoleManager } from "../../UI/DebugConsoleManager";

type EmotionPreset = "neutral" | "relaxed" | "happy" | "sad" | "angry" | "surprised";

// text_ch の ChatMessage.expression_code (先頭 ^N) を受け取り、
// VRM標準表情プリセットを短時間だけ適用する controller。
//
// 設計意図:
// - 汎用VRM対応を優先し、モデルごとに名前が異なる個別morph（眉/目）を直接叩かない
// - その代わり、標準プリセット(happy/sad/...)を使い、口パクvisemeとの重複morph bindだけ除去して
//   口表現との干渉を最小化する（完全分離ではなく、汎用性重視の折衷）
export class FaceEmotionController {
    private readonly expressionManager: VRMExpressionManager;
    private readonly talkManager: TalkManager;
    private readonly logger: DebugConsoleManager;
    private handledMessageId: string | null = null;
    private animationToken: number = 0;
    private readonly animatedPresets: VRMExpressionPresetName[] = [
        "relaxed",
        "happy",
        "sad",
        "angry",
        "surprised",
    ];

    constructor(expressionManager: VRMExpressionManager) {
        this.expressionManager = expressionManager;
        this.talkManager = TalkManager.getManager();
        this.logger = DebugConsoleManager.getManager();
        // 口パク(aa/ih/...)と同じ morph target を感情プリセットが触るVRMでは、
        // 表情と口の競合で破綻しやすい。初期化時に重複bindを除去して干渉を減らす。
        this.detachEmotionBindsOverlappingMouthVisemes();
        // モデル差で感情プリセット未実装のことがあるため、起動時に一覧を出しておく。
        this.logAvailableExpressions();
        this.talkManager.subscribe((event) => {
            this.onTalkManagerEvent(event);
        });
        this.logger.addTextChannelLog("[emotion] FaceEmotionController initialized\n");
    }

    private onTalkManagerEvent(event: TalkManagerEvent): void {
        if (event.type !== "text_channel_message") {
            return;
        }

        const msg = event.message;
        if (msg.message_type !== "system") {
            return;
        }

        // 同一 message_id のストリーミング更新で表情を再トリガーしない。
        if (msg.message_id === this.handledMessageId) {
            return;
        }
        this.handledMessageId = msg.message_id;

        const code = typeof msg.expression_code === "number" ? msg.expression_code : 0;
        const preset = this.mapExpressionCode(code);
        const intensity = this.defaultIntensity(code);
        const holdMs = code === 5 ? 700 : 2200;
        const transitionMs = code === 5 ? 120 : 180;
        const presetExists = this.expressionManager.getExpression(preset) != null;
        // 同じコードでもVRMごとに見え方がかなり違うため、実機調整しやすいよう
        // 適用先プリセット名と強度をログに残す。
        this.logger.addTextChannelLog(
            `[emotion] apply message_id=${msg.message_id} code=${code} preset=${preset} exists=${presetExists} intensity=${intensity.toFixed(2)}\n`,
        );
        this.playEmotion(preset, intensity, holdMs, transitionMs);
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
            case 0:
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
            case 0:
            default:
                return 0.0;
        }
    }

    private playEmotion(
        preset: EmotionPreset,
        intensity: number,
        holdMs: number,
        transitionMs: number,
    ): void {
        // 新しい応答が来たら前の感情アニメーションを打ち切り、最新応答を優先する。
        const token = ++this.animationToken;
        const startMs = performance.now();
        const fadeInMs = Math.max(transitionMs, 1);
        const fadeOutStartMs = startMs + fadeInMs + Math.max(holdMs, 0);
        const endMs = fadeOutStartMs + fadeInMs;

        const animate = () => {
            if (token !== this.animationToken) {
                return;
            }

            const nowMs = performance.now();
            if (preset === "neutral") {
                this.setEmotionPresetValues("neutral", 0.0);
                return;
            }

            let value = 0.0;
            if (nowMs < startMs + fadeInMs) {
                value = intensity * ((nowMs - startMs) / fadeInMs);
            } else if (nowMs < fadeOutStartMs) {
                value = intensity;
            } else if (nowMs < endMs) {
                value = intensity * (1.0 - ((nowMs - fadeOutStartMs) / fadeInMs));
            } else {
                this.setEmotionPresetValues(preset, 0.0);
                return;
            }

            this.setEmotionPresetValues(preset, Math.max(0.0, Math.min(1.0, value)));
            window.requestAnimationFrame(animate);
        };

        animate();
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
        const availability = required.map((name) => `${name}:${names.includes(name) ? "yes" : "no"}`).join(", ");
        this.logger.addTextChannelLog(
            `[emotion] available expressions: ${names.join(", ") || "(none)"}\n`,
        );
        this.logger.addTextChannelLog(`[emotion] preset availability: ${availability}\n`);
    }

    private detachEmotionBindsOverlappingMouthVisemes(): void {
        // three-vrm の expression bind から morph target の識別子（primitive uuid + morph index）を抜き出し、
        // 口パク用visemeと感情プリセットが同じ morph を共有している場合のみ感情側 bind を外す。
        // これにより、モデル差が大きい「目/眉個別morph名」の知識を持たなくても競合を減らせる。
        const visemePresets: VRMExpressionPresetName[] = ["aa", "ih", "ou", "oh", "ee"];
        const mouthMorphBindKeys = new Set<string>();

        for (const preset of visemePresets) {
            const expression = this.expressionManager.getExpression(preset) as unknown as {
                binds?: unknown[];
            } | null;
            if (!expression?.binds) {
                continue;
            }
            for (const bind of expression.binds) {
                for (const key of this.extractMorphBindKeys(bind)) {
                    mouthMorphBindKeys.add(key);
                }
            }
        }

        if (mouthMorphBindKeys.size === 0) {
            this.logger.addTextChannelLog("[emotion] mouth-viseme morph bind overlap check skipped (no viseme morph binds)\n");
            return;
        }

        let removedBindCount = 0;
        for (const preset of this.animatedPresets) {
            const expression = this.expressionManager.getExpression(preset) as unknown as {
                binds?: unknown[];
                deleteBind?: (bind: unknown) => void;
            } | null;
            if (!expression?.binds || !expression.deleteBind) {
                continue;
            }

            // deleteBind() で配列が変化するため、スナップショットを走査する。
            for (const bind of [...expression.binds]) {
                const bindKeys = this.extractMorphBindKeys(bind);
                if (bindKeys.length === 0) {
                    continue;
                }
                const overlaps = bindKeys.some((key) => mouthMorphBindKeys.has(key));
                if (!overlaps) {
                    continue;
                }
                expression.deleteBind(bind);
                removedBindCount += 1;
            }
        }

        this.logger.addTextChannelLog(
            `[emotion] detached ${removedBindCount} emotion morph binds overlapping mouth visemes\n`,
        );
    }

    private extractMorphBindKeys(bind: unknown): string[] {
        // MorphTargetBind だけを対象にし、Material/Texture系 bind はここでは干渉対象にしない。
        const candidate = bind as {
            index?: number;
            primitives?: Array<{ uuid?: string }>;
        };
        if (typeof candidate.index !== "number" || !Array.isArray(candidate.primitives)) {
            return [];
        }
        return candidate.primitives
            .map((primitive) => primitive?.uuid)
            .filter((uuid): uuid is string => typeof uuid === "string")
            .map((uuid) => `${uuid}:${candidate.index}`);
    }
}
