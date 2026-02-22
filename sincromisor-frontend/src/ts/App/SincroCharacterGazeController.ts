import { Detection } from "@mediapipe/tasks-vision";
import { CharacterGaze } from "../CharacterGaze/CharacterGaze";
import { DialogManager } from "../UI/DialogManager";
import { DebugConsoleManager } from "../UI/DebugConsoleManager";

export class SincroCharacterGazeController {
    private readonly dialogManager: DialogManager;
    private readonly debugConsoleManager: DebugConsoleManager;

    constructor(dialogManager: DialogManager, debugConsoleManager: DebugConsoleManager) {
        this.dialogManager = dialogManager;
        this.debugConsoleManager = debugConsoleManager;
    }

    // 顔認識を開始し、視線・AutoMute状態をデバッグUIとRTC mute制御へ反映する。
    start(videoTrack: MediaStreamTrack, onMuteChange: (mute: boolean) => void): void {
        if (!this.dialogManager.enableCharacterGaze()) {
            return;
        }

        const characterGaze = CharacterGaze.getManager();
        characterGaze.initVision();

        const startEye = () => {
            setTimeout(() => {
                // FaceDetectorロード完了前のカメラ初期化を避けるため、ここで待機リトライする。
                if (!characterGaze.modelIsLoaded()) {
                    console.log("Face detector is still loading. wait 1000ms...");
                    startEye();
                    return;
                }

                console.log("start CharacterGaze");
                const eyeTargetElement = document.querySelector("#eyeTarget");
                characterGaze.initCamera(videoTrack, (detects: Detection[]) => {
                    // ここが Gaze 状態の主更新点。DebugConsole購読経由で React 側にも値が流れる。
                    this.debugConsoleManager.updateFaceXLog(characterGaze.targetX());
                    this.debugConsoleManager.updateFaceYLog(characterGaze.targetY());
                    this.debugConsoleManager.updateFacing(characterGaze.facing());
                    if (!eyeTargetElement) {
                        return;
                    }
                    if (detects.length > 0) {
                        eyeTargetElement.setAttribute("fill", "hsl(300 100% 50% / 50%)");
                        eyeTargetElement.setAttribute("cx", `${characterGaze.targetX() * 100}%`);
                        eyeTargetElement.setAttribute("cy", `${characterGaze.targetY() * 100}%`);
                    } else {
                        eyeTargetElement.setAttribute("fill", "hsl(300 100% 50% / 0%)");
                    }
                });
            }, 1000);
        };
        startEye();

        if (!this.dialogManager.enableAutoMute()) {
            return;
        }

        // AutoMute の実適用は RTC controller 側に残し、この controller は視線イベント変換のみ担当する。
        characterGaze.arriveCallback = () => {
            this.debugConsoleManager.updateCharacterEyeStatus(true);
            onMuteChange(false);
        };
        characterGaze.leaveCallback = () => {
            this.debugConsoleManager.updateCharacterEyeStatus(false);
            onMuteChange(true);
        };
    }
}
