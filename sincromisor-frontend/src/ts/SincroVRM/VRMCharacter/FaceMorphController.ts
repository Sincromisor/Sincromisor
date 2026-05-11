import { VRMExpressionManager, VRMExpressionPresetName } from "@pixiv/three-vrm";
import { MathUtils } from "three/src/math/MathUtils.js";
import { CharacterBehaviorSnapshot } from "./CharacterBehaviorState";
import type { SincroFaceRetargetFrame } from "./SincroFaceRetargeter";

type MouseVowel = "A" | "I" | "U" | "E" | "O" | "N";

const MOUTH_PRESETS: VRMExpressionPresetName[] = ["aa", "ih", "ou", "oh", "ee"];

// CharacterBehaviorSnapshot のテロップ/音素情報をもとに口形状を制御する controller。
// 音声波形解析ではなく telop_ch の vowel 情報を使うため、RTC同期に追従しやすい。
export class FaceMorphController {
    private readonly expressionManager: VRMExpressionManager;
    private readonly availableMouthPresets = new Set<VRMExpressionPresetName>();
    private currentMoraID: number = -1;
    private activeMouth: { preset: VRMExpressionPresetName; startMs: number; durationMs: number } | null = null;

    constructor(expressionManager: VRMExpressionManager) {
        this.expressionManager = expressionManager;
        for (const preset of MOUTH_PRESETS) {
            if (this.expressionManager.getExpression(preset) != null) {
                this.availableMouthPresets.add(preset);
            }
        }
        //this.expressionManager.setValue("aa", 0.8);
    }

    // 口形もキャラクター全体と同じ render loop で進め、発話時刻の正本を snapshot に揃える。
    update(snapshot: CharacterBehaviorSnapshot, sincroFace?: SincroFaceRetargetFrame): void {
        if (snapshot.motionPolicy.allowFaceRetarget && snapshot.faceMotion.trackingEnabled && sincroFace) {
            this.currentMoraID = -1;
            this.activeMouth = null;
            this.applySincroMouth(sincroFace);
            return;
        }

        const moraId = snapshot.aiSpeech.currentMoraId;
        if (!snapshot.motionPolicy.allowAiLipSync || !snapshot.aiSpeech.isSpeaking || moraId == null) {
            this.currentMoraID = -1;
            this.activeMouth = null;
            this.resetMouthPresets();
            return;
        }

        if (moraId !== this.currentMoraID) {
            this.currentMoraID = moraId;
            if (snapshot.aiSpeech.currentVowel) {
                this.setMouseVowel(
                    snapshot.aiSpeech.currentVowel.toUpperCase() as MouseVowel,
                    snapshot.aiSpeech.currentLengthSeconds * 1000,
                    snapshot.nowMs,
                );
            }
        }
        this.updateActiveMouth(snapshot.nowMs);
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

    /* 母音とその長さに合わせた口の動きを設定する */
    // 母音切替前に口形状を一旦リセットして、前の口形状の残りを避ける。
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
            this.activeMouth = null;
            return;
        }
        const halfDurationMs = this.activeMouth.durationMs / 2;
        const value = elapsedMs < halfDurationMs
            ? elapsedMs / halfDurationMs
            : 1.0 - ((elapsedMs - halfDurationMs) / halfDurationMs);
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
