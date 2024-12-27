import { VRMExpressionManager, VRMExpressionPresetName } from "@pixiv/three-vrm";
import { Clock } from "three";
import { TalkManager, CurrentMora } from "../../RTC/TalkManager";

type MouseVowel = "A" | "I" | "U" | "E" | "O" | "N";

export class FaceMorphController {
    private readonly clock: Clock;
    private readonly expressionManager: VRMExpressionManager;
    private readonly talkManager: TalkManager;
    private currentMoraID: number = -1;

    constructor(expressionManager: VRMExpressionManager) {
        this.talkManager = TalkManager.getManager();
        this.expressionManager = expressionManager;
        this.clock = new Clock();
        this.clock.start();
        this.setRandomBlink();
        this.setTalkManager();
        //this.expressionManager.setValue("aa", 0.8);
    }

    // ランダムな間隔で200msのまばたきをおこなう
    private setRandomBlink() {
        this.setExpression("blink", 200);
        setTimeout(() => {
            this.setRandomBlink();
        }, 1000 * (Math.random() * 3 + 1));
    }

    private setTalkManager() {
        const cMora: CurrentMora | null = this.talkManager.currentMora();
        if (cMora && cMora.moraID != this.currentMoraID) {
            if (cMora.mora.vowel) {
                this.setMouseVowel(cMora.mora.vowel.toUpperCase() as MouseVowel, cMora.msec);
            }
            this.currentMoraID = cMora.moraID;
        }
        window.requestAnimationFrame(()=>{
            this.setTalkManager();
        });
    }

    /* 母音とその長さに合わせた口の動きを設定する */
    private setMouseVowel(vowel: MouseVowel, msec: number) {
        this.expressionManager.setValue("aa", 0.0);
        this.expressionManager.setValue("ih", 0.0);
        this.expressionManager.setValue("ou", 0.0);
        this.expressionManager.setValue("oh", 0.0);
        this.expressionManager.setValue("ee", 0.0);
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
        const startTime = this.clock.getElapsedTime();
        const duration = msec / 1000 / 2;
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
