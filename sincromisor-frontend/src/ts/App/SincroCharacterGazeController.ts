import { Detection } from "@mediapipe/tasks-vision";
import { CharacterGaze } from "../CharacterGaze/CharacterGaze";
import { DialogManager } from "../UI/DialogManager";
import { DebugConsoleManager } from "../UI/DebugConsoleManager";

// CharacterGaze の起動と、視線検出結果 -> Debug UI / AutoMute 変換を担当する controller。
// DOM依存（#eyeTarget 表示）は移行期間の暫定としてここに閉じ込めている。
export class SincroCharacterGazeController {
    private readonly dialogManager: DialogManager;
    private readonly debugConsoleManager: DebugConsoleManager;
    private videoTrack: MediaStreamTrack | null = null;
    private onMuteChange: ((mute: boolean) => void) | null = null;
    private visionInitRequested = false;
    private cameraStartRequested = false;
    private cameraStarted = false;

    constructor(dialogManager: DialogManager, debugConsoleManager: DebugConsoleManager) {
        this.dialogManager = dialogManager;
        this.debugConsoleManager = debugConsoleManager;
        const characterGaze = CharacterGaze.getManager();
        this.debugConsoleManager.setCharacterGazeTrackingTuning(characterGaze.getTrackingTuning());
        this.debugConsoleManager.setCharacterGazeTrackingTuningChangeCallback((config) => {
            characterGaze.setTrackingTuning(config);
        });
        // 起動後に Gaze 設定を OFF->ON した場合も、その場で開始できるように設定変更を監視する。
        this.dialogManager.subscribeSettingsChange(() => {
            this.handleGazeSettingChanged();
        });
    }

    // 顔認識を開始し、視線・AutoMute状態をデバッグUIとRTC mute制御へ反映する。
    start(videoTrack: MediaStreamTrack, onMuteChange: (mute: boolean) => void): void {
        this.videoTrack = videoTrack;
        this.onMuteChange = onMuteChange;

        const characterGaze = CharacterGaze.getManager();
        this.bindCharacterGazeCallbacks(characterGaze, onMuteChange);
        this.handleGazeSettingChanged();
    }

    // Gaze 有効時のみ、MediaPipe の初期化とカメラ開始を1回だけ行う。
    // 起動時 OFF でも videoTrack を保持しておき、設定変更で ON になった瞬間に開始できるようにする。
    private ensureCharacterGazeStartedIfEnabled(): void {
        if (!this.dialogManager.enableCharacterGaze()) {
            return;
        }
        if (!this.videoTrack || !this.onMuteChange) {
            return;
        }

        const characterGaze = CharacterGaze.getManager();
        if (!this.visionInitRequested) {
            this.visionInitRequested = true;
            characterGaze.initVision();
        }
        this.bindCharacterGazeCallbacks(characterGaze, this.onMuteChange);
        if (this.cameraStarted) {
            // OFF で止めた後の ON は、カメラ再初期化ではなく検出ループ再開だけで良い。
            characterGaze.resumePredictionLoop();
            return;
        }
        this.ensureCameraStarted(characterGaze, this.videoTrack);
    }

    // Gaze ON/OFF 切り替え時の開始/停止をまとめて扱う。
    // OFF 時は検出ループ自体を停止し、CPU/GPU負荷を下げる。
    private handleGazeSettingChanged(): void {
        const characterGaze = CharacterGaze.getManager();
        if (!this.dialogManager.enableCharacterGaze()) {
            characterGaze.stopPredictionLoop();
            this.debugConsoleManager.setCharacterGazePaused(true);
            const eyeTargetElement = document.querySelector("#eyeTarget");
            eyeTargetElement?.setAttribute("fill", "hsl(300 100% 50% / 0%)");
            return;
        }
        this.debugConsoleManager.setCharacterGazePaused(false);
        this.ensureCharacterGazeStartedIfEnabled();
    }

    // CharacterGaze の在席/離席 callback は 1 つしか持てないため、毎回上書きして最新設定を参照する。
    private bindCharacterGazeCallbacks(characterGaze: CharacterGaze, onMuteChange: (mute: boolean) => void): void {
        // AutoMute の実適用は RTC controller 側に残し、この controller は視線イベント変換のみ担当する。
        characterGaze.arriveCallback = () => {
            this.debugConsoleManager.updateCharacterEyeStatus(true);
            if (this.dialogManager.enableAutoMute()) {
                onMuteChange(false);
            }
        };
        characterGaze.leaveCallback = () => {
            this.debugConsoleManager.updateCharacterEyeStatus(false);
            if (this.dialogManager.enableAutoMute()) {
                onMuteChange(true);
            }
        };
    }

    private ensureCameraStarted(characterGaze: CharacterGaze, videoTrack: MediaStreamTrack): void {
        if (this.cameraStarted || this.cameraStartRequested) {
            return;
        }
        this.cameraStartRequested = true;

        // MediaPipe モデルの読み込み完了を待ってからカメラ処理を開始する。
        const startEye = () => {
            window.setTimeout(() => {
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
                    // 設定変更後も動作が追従するよう、毎フレーム時点の設定を参照する。
                    const gazeEnabled = this.dialogManager.enableCharacterGaze();
                    // ここが Gaze 状態の主更新点。DebugConsole購読経由で React 側にも値が流れる。
                    if (gazeEnabled) {
                        this.debugConsoleManager.updateFaceXLog(characterGaze.targetX());
                        this.debugConsoleManager.updateFaceYLog(characterGaze.targetY());
                        this.debugConsoleManager.updateFacing(characterGaze.facing());
                        this.debugConsoleManager.updateCharacterGazeTargetDebug(characterGaze.targetSelectionDebugText());
                    }
                    if (!eyeTargetElement) {
                        return;
                    }
                    if (gazeEnabled && detects.length > 0) {
                        eyeTargetElement.setAttribute("fill", "hsl(300 100% 50% / 50%)");
                        eyeTargetElement.setAttribute("cx", `${characterGaze.targetX() * 100}%`);
                        eyeTargetElement.setAttribute("cy", `${characterGaze.targetY() * 100}%`);
                    } else {
                        eyeTargetElement.setAttribute("fill", "hsl(300 100% 50% / 0%)");
                    }
                }).then((started) => {
                    this.cameraStarted = started;
                    if (!started) {
                        this.cameraStartRequested = false;
                    }
                }).catch((error) => {
                    console.error("Failed to init CharacterGaze camera.", error);
                    this.cameraStartRequested = false;
                });
            }, 1000);
        };
        startEye();
    }
}
