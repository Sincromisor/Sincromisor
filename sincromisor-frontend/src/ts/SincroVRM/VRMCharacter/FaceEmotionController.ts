import { VRMExpressionManager, VRMExpressionPresetName } from "@pixiv/three-vrm";
import { TalkManager, TalkManagerEvent } from "../../RTC/TalkManager";
import { DebugConsoleManager } from "../../UI/DebugConsoleManager";

type EmotionPreset = "neutral" | "relaxed" | "happy" | "sad" | "angry" | "surprised";

// text_ch の ChatMessage.expression_code (先頭 ^N) を受け取り、
// VRM標準表情プリセットを短時間だけ適用する controller。
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
}
