import type { VRMExpressionManager, VRMExpressionPresetName } from "@pixiv/three-vrm";
import { MathUtils } from "three/src/math/MathUtils.js";
import type { SincroFaceRetargetFrame } from "../retargeting/sincroFaceRetargeter";
import type { CharacterBehaviorSnapshot } from "./characterBehaviorState";

type MouseVowel = "A" | "I" | "U" | "E" | "O" | "N";

const MOUTH_PRESETS: VRMExpressionPresetName[] = ["aa", "ih", "ou", "oh", "ee"];

/**
 * カメラの顔追従と `telop_ch` の母音情報から、VRM の口形を制御する。
 *
 * キャラクターの発話中は合成音声と同期する母音口形を優先し、母音未着時もカメラ口形へ戻さない。
 * 発話していない間だけカメラ口形を適用する。
 */
export class FaceMorphController {
    private readonly expressionManager: VRMExpressionManager;
    private readonly availableMouthPresets = new Set<VRMExpressionPresetName>();
    private currentMoraID: number = -1;
    private activeMouth:
        | {
              preset: VRMExpressionPresetName;
              startMs: number;
              durationMs: number;
          }
        | undefined;

    /** 利用可能な標準母音表情を検出し、モデル差で欠けた口形を安全に無視できるようにする。 */
    constructor(expressionManager: VRMExpressionManager) {
        this.expressionManager = expressionManager;
        for (const preset of MOUTH_PRESETS) {
            const expression = this.expressionManager.getExpression(preset) ?? undefined;
            if (expression !== undefined) {
                this.availableMouthPresets.add(preset);
            }
        }
    }

    /** キャラクター全体と同じ描画ループで、現在の優先入力に応じた口形を適用する。 */
    update(snapshot: CharacterBehaviorSnapshot, sincroFace?: SincroFaceRetargetFrame): void {
        const moraId = snapshot.aiSpeech.currentMoraId;
        if (snapshot.motionPolicy.allowAiLipSync && snapshot.aiSpeech.isSpeaking) {
            if (moraId === undefined) {
                this.currentMoraID = -1;
                this.activeMouth = undefined;
                this.resetMouthPresets();
                return;
            }
            if (moraId !== this.currentMoraID) {
                this.currentMoraID = moraId;
                const currentVowel = parseMouseVowel(snapshot.aiSpeech.currentVowel);
                if (currentVowel) {
                    this.setMouseVowel(
                        currentVowel,
                        snapshot.aiSpeech.currentLengthSeconds * 1000,
                        snapshot.nowMs,
                    );
                }
            }
            this.updateActiveMouth(snapshot.nowMs);
            return;
        }

        if (
            snapshot.motionPolicy.allowFaceRetarget &&
            snapshot.faceMotion.trackingEnabled &&
            sincroFace
        ) {
            this.currentMoraID = -1;
            this.activeMouth = undefined;
            this.applySincroMouth(sincroFace);
            return;
        }

        this.currentMoraID = -1;
        this.activeMouth = undefined;
        this.resetMouthPresets();
    }

    private applySincroMouth(sincroFace: SincroFaceRetargetFrame): void {
        const values: Partial<Record<VRMExpressionPresetName, number>> = {
            aa: sincroFace.expressions.aa,
            ih: sincroFace.expressions.ih,
            ou: sincroFace.expressions.ou,
            oh: sincroFace.expressions.oh,
            ee: sincroFace.expressions.ee,
        };
        for (const preset of this.availableMouthPresets) {
            this.expressionManager.setValue(preset, MathUtils.clamp(values[preset] ?? 0, 0, 1));
        }
    }

    // 母音切替時に前の口形を消し、複数の母音表情が重ならないようにする。
    private setMouseVowel(vowel: MouseVowel, msec: number, nowMs: number) {
        this.resetMouthPresets();
        switch (vowel) {
            case "A":
                this.setExpression("aa", msec, nowMs);
                break;
            case "I":
                this.setExpression("ih", msec, nowMs);
                break;
            case "U":
                this.setExpression("ou", msec, nowMs);
                break;
            case "E":
                this.setExpression("ee", msec, nowMs);
                break;
            case "O":
                this.setExpression("oh", msec, nowMs);
                break;
            case "N":
                break;
        }
    }

    /*
      顔のシェイプキーを、指定した時間の間だけ適用する。
      滑らかにアニメーションするよう、指定した時間の間に徐々に変化させる。
      第1引数で対象となるExpressionの名前、第2引数でそのExpressionを1.0にする時間(ms)を指定する。
    */
    private setExpression(name: VRMExpressionPresetName, msec: number, nowMs: number): void {
        if (!this.availableMouthPresets.has(name)) {
            return;
        }
        this.activeMouth = {
            preset: name,
            startMs: nowMs,
            durationMs: Math.max(80, msec),
        };
    }

    private updateActiveMouth(nowMs: number): void {
        if (!this.activeMouth) {
            return;
        }
        const elapsedMs = nowMs - this.activeMouth.startMs;
        if (elapsedMs >= this.activeMouth.durationMs) {
            this.expressionManager.setValue(this.activeMouth.preset, 0.0);
            this.activeMouth = undefined;
            return;
        }
        const halfDurationMs = this.activeMouth.durationMs / 2;
        const value =
            elapsedMs < halfDurationMs
                ? elapsedMs / halfDurationMs
                : 1.0 - (elapsedMs - halfDurationMs) / halfDurationMs;
        for (const preset of this.availableMouthPresets) {
            this.expressionManager.setValue(
                preset,
                preset === this.activeMouth.preset ? MathUtils.clamp(value, 0.0, 1.0) : 0.0,
            );
        }
    }

    private resetMouthPresets(): void {
        for (const preset of this.availableMouthPresets) {
            this.expressionManager.setValue(preset, 0.0);
        }
    }
}

function parseMouseVowel(value: string | undefined): MouseVowel | undefined {
    const normalized = value?.toUpperCase();
    if (
        normalized === "A" ||
        normalized === "I" ||
        normalized === "U" ||
        normalized === "E" ||
        normalized === "O" ||
        normalized === "N"
    ) {
        return normalized;
    }
    return undefined;
}

/*
    [
        "VRMExpression_aa",
        "VRMExpression_angry",
        "VRMExpression_blink",
        "VRMExpression_blinkLeft",
        "VRMExpression_blinkRight",
        "VRMExpression_ee",
        "VRMExpression_happy",
        "VRMExpression_ih",
        "VRMExpression_lookDown",
        "VRMExpression_lookLeft",
        "VRMExpression_lookRight",
        "VRMExpression_lookUp",
        "VRMExpression_neutral",
        "VRMExpression_oh",
        "VRMExpression_ou",
        "VRMExpression_relaxed",
        "VRMExpression_sad",
        "VRMExpression_surprised"
    ]
*/
