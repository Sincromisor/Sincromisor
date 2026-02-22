import { Detection } from "@mediapipe/tasks-vision";
import { CharacterGaze } from "../CharacterGaze/CharacterGaze";
import { DialogManager } from "../UI/DialogManager";
import { DebugConsoleManager } from "../UI/DebugConsoleManager";

// CharacterGaze の起動と、視線検出結果 -> Debug UI / AutoMute 変換を担当する controller。
// DOM依存（#eyeTarget 表示）は移行期間の暫定としてここに閉じ込めている。
export class SincroCharacterGazeController {
    private readonly dialogManager: DialogManager;
    private readonly debugConsoleManager: DebugConsoleManager;

    constructor(dialogManager: DialogManager, debugConsoleManager: DebugConsoleManager) {
        this.dialogManager = dialogManager;
        this.debugConsoleManager = debugConsoleManager;
    }

    // 顔認識を開始し、視線・AutoMute状態をデバッグUIとRTC mute制御へ反映する。
    start(videoTrack: MediaStreamTrack, onMuteChange: (mute: boolean) => void): void {
        // 360deg camera ページなど、Gaze を使わないページ設定では何もしない。
        if (!this.dialogManager.enableCharacterGaze()) {
            return;
        }

        const characterGaze = CharacterGaze.getManager();
        characterGaze.initVision();

        // MediaPipe モデルの読み込み完了を待ってからカメラ処理を開始する。
        const startEye = () => {
            setTimeout(() => {
                // FaceDetectorロード完了前のカメラ初期化を避けるため、ここで待機リトライする。
                if (!characterGaze.modelIsLoaded()) {
                    console.log("Face detector is still loading. wait 1000ms...");
                    startEye();
                    return;
                }

                console.log("start CharacterGaze");
                // 既存 SVG オーバーレイ表示。React へ移しきるまでここで更新を閉じ込める。
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

        // AutoMute を使わない場合でも Gaze 可視化は有効にしたいため、ここで処理を分岐する。
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
