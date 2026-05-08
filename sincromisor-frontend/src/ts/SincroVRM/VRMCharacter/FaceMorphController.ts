import { VRMExpressionManager, VRMExpressionPresetName } from "@pixiv/three-vrm";
import { Clock } from "three/src/core/Clock.js";
import { TalkManager, CurrentMora } from "../../RTC/TalkManager";

type MouseVowel = "A" | "I" | "U" | "E" | "O" | "N";

const MOUTH_PRESETS: VRMExpressionPresetName[] = ["aa", "ih", "ou", "oh", "ee"];

// テロップ/音素情報(TalkManager.currentMora)をもとに口形状とまばたきを制御する controller。
// 音声波形解析ではなく telop_ch の vowel 情報を使うため、RTC同期に追従しやすい。
export class FaceMorphController {
    private readonly clock: Clock;
    private readonly expressionManager: VRMExpressionManager;
    private readonly talkManager: TalkManager;
    private readonly availableMouthPresets = new Set<VRMExpressionPresetName>();
    private currentMoraID: number = -1;

    constructor(expressionManager: VRMExpressionManager) {
        this.talkManager = TalkManager.getManager();
        this.expressionManager = expressionManager;
        for (const preset of MOUTH_PRESETS) {
            if (this.expressionManager.getExpression(preset) != null) {
                this.availableMouthPresets.add(preset);
            }
        }
        this.clock = new Clock();
        this.clock.start();
        this.setTalkManager();
        //this.expressionManager.setValue("aa", 0.8);
    }

    // TalkManager をポーリングし、mora 単位で新しい口形状が来た時だけ expression を更新する。
    private setTalkManager() {
        const cMora: CurrentMora | null = this.talkManager.currentMora();
        if (cMora && cMora.moraID != this.currentMoraID) {
            if (cMora.mora.vowel) {
                this.setMouseVowel(cMora.mora.vowel.toUpperCase() as MouseVowel, cMora.msec);
            }
            this.currentMoraID = cMora.moraID;
        }
        window.requestAnimationFrame(() => {
            this.setTalkManager();
        });
    }

    /* 母音とその長さに合わせた口の動きを設定する */
    // 母音切替前に口形状を一旦リセットして、前の口形状の残りを避ける。
    private setMouseVowel(vowel: MouseVowel, msec: number) {
        for (const preset of this.availableMouthPresets) {
            this.expressionManager.setValue(preset, 0.0);
        }
        switch (vowel) {
            case "A":
                this.setExpression("aa", msec);
                break;
            case "I":
                this.setExpression("ih", msec);
                break;
            case "U":
                this.setExpression("ou", msec);
                break;
            case "E":
                this.setExpression("ee", msec);
                break;
            case "O":
                this.setExpression("oh", msec);
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
    private setExpression(name: VRMExpressionPresetName, msec: number): void {
        if (!this.availableMouthPresets.has(name)) {
            return;
        }
        const startTime = this.clock.getElapsedTime();
        const duration = Math.max(0.04, msec / 1000 / 2);
        let isInFadeOut = false;

        const updateExpression = () => {
            const currentTime = this.clock.getElapsedTime();
            const elapsed = currentTime - startTime;
            if (!isInFadeOut && elapsed < duration) {
                // フェードイン
                const value = Math.min(1.0, elapsed / duration);
                this.expressionManager.setValue(name, value);
                window.requestAnimationFrame(updateExpression);
            } else if (!isInFadeOut) {
                // フェードイン完了、フェードアウト開始
                isInFadeOut = true;
                this.expressionManager.setValue(name, 1.0);
                window.requestAnimationFrame(updateExpression);
            } else {
                // フェードアウト
                const fadeOutElapsed = elapsed - duration;
                if (fadeOutElapsed < duration) {
                    const value = 1.0 - (fadeOutElapsed / duration);
                    this.expressionManager.setValue(name, Math.max(0, value));
                    window.requestAnimationFrame(updateExpression);
                } else {
                    this.expressionManager.setValue(name, 0.0);
                }
            }
        };

        updateExpression();
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
