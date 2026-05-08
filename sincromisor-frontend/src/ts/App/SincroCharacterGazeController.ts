import { Detection } from "@mediapipe/tasks-vision";
import { CharacterGaze } from "../CharacterGaze/CharacterGaze";
import { VideoInputManager } from "../RTC/VideoInputManager";
import { ChatMessageService } from "../UI/ChatMessageService";
import { DialogManager } from "../UI/DialogManager";
import { DebugConsoleManager } from "../UI/DebugConsoleManager";
import { CharacterBehaviorState } from "../SincroVRM/VRMCharacter/CharacterBehaviorState";

// CharacterGaze の起動と、視線検出結果 -> Debug UI / AutoMute 変換を担当する controller。
// DOM依存（#eyeTarget 表示）は移行期間の暫定としてここに閉じ込めている。
export class SincroCharacterGazeController {
    private readonly dialogManager: DialogManager;
    private readonly debugConsoleManager: DebugConsoleManager;
    private readonly chatMessageService: ChatMessageService;
    private readonly characterBehaviorState: CharacterBehaviorState;
    private readonly videoInputManager = new VideoInputManager();
    private onMuteChange: ((mute: boolean) => void) | null = null;
    private visionInitPromise: Promise<void> | null = null;
    private hasStarted = false;
    private gazeSettingsSnapshot: DialogGazeSettingsSnapshot | null = null;
    private pendingCameraRefreshToken = 0;
    private cameraRefreshChain: Promise<void> = Promise.resolve();

    constructor(
        dialogManager: DialogManager,
        debugConsoleManager: DebugConsoleManager,
        chatMessageService: ChatMessageService,
    ) {
        this.dialogManager = dialogManager;
        this.debugConsoleManager = debugConsoleManager;
        this.chatMessageService = chatMessageService;
        this.characterBehaviorState = CharacterBehaviorState.getManager();
        const characterGaze = CharacterGaze.getManager();
        this.debugConsoleManager.setCharacterGazeTrackingTuning(characterGaze.getTrackingTuning());
        this.debugConsoleManager.setCharacterGazeTrackingTuningChangeCallback((config) => {
            characterGaze.setTrackingTuning(config);
        });
        // Gaze ON/OFF と camera selector の両方に追従できるよう、設定変更は差分監視で扱う。
        this.dialogManager.subscribeSettingsChange(() => {
            this.applyDialogGazeSettings(false);
        });
    }

    // 顔認識を開始し、視線・AutoMute状態をデバッグUIとRTC mute制御へ反映する。
    start(onMuteChange: (mute: boolean) => void): void {
        this.onMuteChange = onMuteChange;
        this.hasStarted = true;

        const characterGaze = CharacterGaze.getManager();
        this.bindCharacterGazeCallbacks(characterGaze, onMuteChange);
        this.applyDialogGazeSettings(true);
    }

    // Dialog 設定から Gaze runtime へ必要な差分だけを反映する。
    private applyDialogGazeSettings(forceAll: boolean): void {
        const next = this.readDialogGazeSettingsSnapshot();
        const prev = this.gazeSettingsSnapshot;
        const videoDeviceChanged = forceAll || !prev || prev.videoInputDeviceId !== next.videoInputDeviceId;
        const gazeEnabledChanged = forceAll || !prev || prev.enableCharacterGaze !== next.enableCharacterGaze;

        if (videoDeviceChanged) {
            this.videoInputManager.setVideoInputDeviceId(next.videoInputDeviceId);
        }
        this.gazeSettingsSnapshot = next;

        if (!this.hasStarted || !this.onMuteChange) {
            return;
        }

        if (!next.enableCharacterGaze) {
            if (gazeEnabledChanged || videoDeviceChanged) {
                this.stopCharacterGazeCamera();
            }
            return;
        }
        if (gazeEnabledChanged || videoDeviceChanged) {
            this.scheduleCameraRefresh();
        }
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

    private stopCharacterGazeCamera(): void {
        const characterGaze = CharacterGaze.getManager();
        characterGaze.detachCamera();
        this.characterBehaviorState.setGazeTrackingEnabled(false);
        this.videoInputManager.releaseVideoTrack();
        this.debugConsoleManager.setCharacterGazePaused(true);
        this.debugConsoleManager.updateCharacterGazeTargetDebug("停止中");
        const eyeTargetElement = document.querySelector("#eyeTarget");
        eyeTargetElement?.setAttribute("fill", "hsl(300 100% 50% / 0%)");
    }

    private scheduleCameraRefresh(): void {
        const refreshToken = ++this.pendingCameraRefreshToken;
        this.cameraRefreshChain = this.cameraRefreshChain
            .catch(() => {
                // 直前の切替失敗で後続チェーンが止まらないようにする。
            })
            .then(async () => {
                if (refreshToken !== this.pendingCameraRefreshToken) {
                    return;
                }
                await this.refreshCharacterGazeCamera(refreshToken);
            });
    }

    private async refreshCharacterGazeCamera(refreshToken: number): Promise<void> {
        if (!this.dialogManager.enableCharacterGaze() || !this.onMuteChange) {
            return;
        }
        const characterGaze = CharacterGaze.getManager();
        this.bindCharacterGazeCallbacks(characterGaze, this.onMuteChange);
        this.debugConsoleManager.setCharacterGazePaused(false);
        this.characterBehaviorState.setGazeTrackingEnabled(true);

        try {
            await this.ensureVisionInitialized(characterGaze);
            const nextVideoTrack = await this.videoInputManager.reacquireVideoTrack();
            if (refreshToken !== this.pendingCameraRefreshToken || !this.dialogManager.enableCharacterGaze()) {
                nextVideoTrack.stop();
                return;
            }

            console.log("start CharacterGaze");
            const started = await characterGaze.initCamera(nextVideoTrack, (detects: Detection[]) => {
                // 設定変更後も動作が追従するよう、毎フレーム時点の設定を参照する。
                const gazeEnabled = this.dialogManager.enableCharacterGaze();
                // ここが Gaze 状態の主更新点。DebugConsole購読経由で React 側にも値が流れる。
                if (gazeEnabled) {
                    this.debugConsoleManager.updateFaceXLog(characterGaze.targetX());
                    this.debugConsoleManager.updateFaceYLog(characterGaze.targetY());
                    this.debugConsoleManager.updateFacing(characterGaze.facing());
                    this.debugConsoleManager.updateCharacterGazeTargetDebug(characterGaze.targetSelectionDebugText());
                    this.characterBehaviorState.applyGazeState(characterGaze, detects);
                }
                this.updateEyeTargetOverlay(characterGaze, gazeEnabled, detects);
            });
            if (!started) {
                throw new Error("CharacterGaze camera initialization returned false.");
            }
        } catch (error) {
            if (refreshToken !== this.pendingCameraRefreshToken) {
                return;
            }
            console.error("Failed to init CharacterGaze camera.", error);
            this.stopCharacterGazeCamera();
            const detail = error instanceof Error ? error.message : String(error);
            const selectedDeviceId = this.videoInputManager.getVideoInputDeviceId();
            const deviceLabel = selectedDeviceId ? `deviceId=${selectedDeviceId}` : "既定デバイス";
            this.chatMessageService.writeErrorMessage(
                `選択した視線検出用カメラへの切替に失敗しました。(${deviceLabel}) - ${detail}`,
            );
        }
    }

    private ensureVisionInitialized(characterGaze: CharacterGaze): Promise<void> {
        if (characterGaze.modelIsLoaded()) {
            return Promise.resolve();
        }
        if (!this.visionInitPromise) {
            this.visionInitPromise = characterGaze.initVision()
                .catch((error) => {
                    this.visionInitPromise = null;
                    throw error;
                });
        }
        return this.visionInitPromise;
    }

    private updateEyeTargetOverlay(characterGaze: CharacterGaze, gazeEnabled: boolean, detects: Detection[]): void {
        // 既存 SVG オーバーレイ表示。React へ移しきるまでここで更新を閉じ込める。
        const eyeTargetElement = document.querySelector("#eyeTarget");
        if (!eyeTargetElement) {
            return;
        }
        if (gazeEnabled && detects.length > 0) {
            eyeTargetElement.setAttribute("fill", "hsl(300 100% 50% / 50%)");
            eyeTargetElement.setAttribute("cx", `${characterGaze.targetX() * 100}%`);
            eyeTargetElement.setAttribute("cy", `${characterGaze.targetY() * 100}%`);
            return;
        }
        eyeTargetElement.setAttribute("fill", "hsl(300 100% 50% / 0%)");
    }

    private readDialogGazeSettingsSnapshot(): DialogGazeSettingsSnapshot {
        return {
            enableCharacterGaze: this.dialogManager.enableCharacterGaze(),
            videoInputDeviceId: this.dialogManager.videoInputDeviceId(),
        };
    }
}

type DialogGazeSettingsSnapshot = {
    enableCharacterGaze: boolean;
    videoInputDeviceId: string | null;
};
