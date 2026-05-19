import type { VRMExpressionManager, VRMExpressionPresetName } from "@pixiv/three-vrm";
import { MathUtils } from "three/src/math/MathUtils.js";
import type {
    CharacterBehaviorSnapshot,
    CharacterInteractionState,
} from "./characterBehaviorState";
import { BLINK_INTERVAL_BY_STATE, EYE_BEHAVIOR_CONFIG } from "./eyeBehaviorValues";

// VRM 標準 blink expression の状態機械。Face retarget fallback と通常まばたきの両方から使う。
export class EyeBlinkController {
    private readonly expressionManager: VRMExpressionManager;
    private readonly availableBlinkPresets: Set<VRMExpressionPresetName>;
    private blinkStartedAtMs: number | undefined;
    private nextBlinkAtMs: number;

    constructor(
        expressionManager: VRMExpressionManager,
        availableBlinkPresets: Set<VRMExpressionPresetName>,
        nowMs: number = performance.now(),
    ) {
        this.expressionManager = expressionManager;
        this.availableBlinkPresets = new Set(availableBlinkPresets);
        this.nextBlinkAtMs = nowMs + this.randomRange(1800, 4200);
    }

    hasAvailablePresets(): boolean {
        return this.availableBlinkPresets.size > 0;
    }

    apply(snapshot: CharacterBehaviorSnapshot, nowMs: number): void {
        if (this.availableBlinkPresets.size === 0) {
            return;
        }
        if (this.isSuppressed(snapshot, nowMs)) {
            this.applyExpressions(0, 0);
            this.blinkStartedAtMs = undefined;
            this.nextBlinkAtMs = Math.max(this.nextBlinkAtMs, nowMs + 450);
            return;
        }
        if (this.blinkStartedAtMs === undefined && nowMs >= this.nextBlinkAtMs) {
            this.blinkStartedAtMs = nowMs;
        }
        if (this.blinkStartedAtMs === undefined) {
            this.applyExpressions(0, 0);
            return;
        }

        const elapsedMs = nowMs - this.blinkStartedAtMs;
        const durationMs = EYE_BEHAVIOR_CONFIG.blinkDurationMs;
        if (elapsedMs >= durationMs) {
            this.applyExpressions(0, 0);
            this.blinkStartedAtMs = undefined;
            this.nextBlinkAtMs = nowMs + this.nextDelayMs(snapshot.state);
            return;
        }
        const closeMs = durationMs * EYE_BEHAVIOR_CONFIG.blinkCloseRatio;
        const value =
            elapsedMs < closeMs
                ? elapsedMs / closeMs
                : 1 - (elapsedMs - closeMs) / (durationMs - closeMs);
        this.applyExpressions(value, value);
    }

    applyExpressions(left: number, right: number): void {
        const leftValue = MathUtils.clamp(left, 0, 1);
        const rightValue = MathUtils.clamp(right, 0, 1);
        const hasSeparateBlink =
            this.availableBlinkPresets.has("blinkLeft") ||
            this.availableBlinkPresets.has("blinkRight");

        // VRM 1.0 は `blink` を両目、`blinkLeft`/`blinkRight` を片目として定義する。
        // 片目 preset があるモデルでは左右を保持し、無いモデルだけ `blink` に畳み込む。
        if (hasSeparateBlink) {
            this.setExpressionIfAvailable("blink", 0);
            this.setExpressionIfAvailable("blinkLeft", leftValue);
            this.setExpressionIfAvailable("blinkRight", rightValue);
            return;
        }
        this.setExpressionIfAvailable("blink", Math.max(leftValue, rightValue));
    }

    private setExpressionIfAvailable(preset: VRMExpressionPresetName, value: number): void {
        if (!this.availableBlinkPresets.has(preset)) {
            return;
        }
        this.expressionManager.setValue(preset, MathUtils.clamp(value, 0, 1));
    }

    private isSuppressed(snapshot: CharacterBehaviorSnapshot, nowMs: number): boolean {
        return (
            snapshot.aiSpeech.expressionCode === 5 &&
            snapshot.aiSpeech.lastUpdatedAtMs !== undefined &&
            nowMs - snapshot.aiSpeech.lastUpdatedAtMs <=
                EYE_BEHAVIOR_CONFIG.surprisedBlinkSuppressMs
        );
    }

    private nextDelayMs(state: CharacterInteractionState): number {
        const range = BLINK_INTERVAL_BY_STATE[state];
        return this.randomRange(range.minMs, range.maxMs);
    }

    private randomRange(min: number, max: number): number {
        return min + (max - min) * Math.random();
    }
}
