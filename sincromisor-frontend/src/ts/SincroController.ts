import { RTCTalkClient } from "./RTC/RTCTalkClient";
import { UserMediaManager, VadStateReport, VadThresholdMode as UserMediaVadThresholdMode } from "./RTC/UserMediaManager";
import { CharacterGaze } from "./CharacterGaze/CharacterGaze";
import { ChatMessageManager } from "./UI/ChatMessageManager";
import { DialogManager } from "./UI/DialogManager";
import { TalkManager } from "./RTC/TalkManager";
import { AudioFilterControlConfig, DebugConsoleManager, LearnedVadPerformanceMode, VadThresholdMode as DebugVadThresholdMode } from "./UI/DebugConsoleManager";
import { ChatMessage, TelopChannelMessage } from "./RTC/RTCMessage";
import { Detection } from "@mediapipe/tasks-vision";
import { SincroRTCConfigManager } from "./RTC/SincroRTCConfigManager";

export class SincroController {
    private readonly dialogManager: DialogManager;
    private readonly debugConsoleManager: DebugConsoleManager;
    private readonly chatMessageManager: ChatMessageManager;
    private readonly talkManager: TalkManager;
    private readonly userMediaManager: UserMediaManager;
    private readonly rtcConfigManager: SincroRTCConfigManager;
    private rtcc?: RTCTalkClient;

    constructor() {
        this.dialogManager = DialogManager.getManager();
        this.debugConsoleManager = DebugConsoleManager.getManager();
        this.chatMessageManager = ChatMessageManager.getManager();
        this.talkManager = TalkManager.getManager();
        this.rtcConfigManager = SincroRTCConfigManager.getManager((err) => {
            this.chatMessageManager.writeErrorMessage(`WebRTCの設定の取得に失敗しました。 - ${err}`);
        });
        this.userMediaManager = new UserMediaManager();
        // 設定ダイアログのマイク処理設定を getUserMedia 制約へ反映する。
        this.userMediaManager.setNoiseSuppression(this.dialogManager.enableNoiseSuppression());
        this.userMediaManager.setEchoCancellation(this.dialogManager.enableEchoCancellation());
        this.userMediaManager.setAutoGainControl(this.dialogManager.enableAutoGainControl());
        this.userMediaManager.setVadGateEnabled(this.dialogManager.enableVadGate());
        this.userMediaManager.setVenueNoiseModeEnabled(this.dialogManager.enableVenueNoiseMode());
        this.debugConsoleManager.setLocalAudioFilterConfig(this.userMediaManager.getAudioFilterConfig());
        this.debugConsoleManager.setLocalAudioFilterChangeCallback((config: AudioFilterControlConfig) => {
            this.userMediaManager.setAudioFilterConfig(config);
        });
        this.debugConsoleManager.setLocalVadRmsThreshold(this.userMediaManager.getVadThresholds().rmsThreshold);
        this.debugConsoleManager.setLocalVadThresholdMode(this.userMediaManager.getVadThresholdMode());
        this.debugConsoleManager.setLocalLearnedVadTuning(this.userMediaManager.getLearnedVadTuning());
        this.debugConsoleManager.setLocalLearnedVadStrictMode(this.userMediaManager.getLearnedVadStrictMode());
        // 学習VADは balanced を初期プリセットとして採用し、必要時にUIから変更できるようにする。
        this.debugConsoleManager.setLocalLearnedVadPerformanceMode("balanced");
        this.debugConsoleManager.setLocalVadThresholdModeChangeCallback((mode: DebugVadThresholdMode) => {
            this.userMediaManager.setVadThresholdMode(mode as UserMediaVadThresholdMode);
        });
        this.debugConsoleManager.setLocalLearnedVadPerformanceModeChangeCallback((mode: LearnedVadPerformanceMode) => {
            this.userMediaManager.setLearnedVadPerformanceMode(mode);
            this.debugConsoleManager.setLocalLearnedVadTuning(this.userMediaManager.getLearnedVadTuning());
        });
        this.debugConsoleManager.setLocalLearnedVadTuningChangeCallback((config) => {
            this.userMediaManager.setLearnedVadTuning(config);
        });
        this.debugConsoleManager.setLocalLearnedVadStrictModeChangeCallback((enabled) => {
            this.userMediaManager.setLearnedVadStrictMode(enabled);
        });
        this.debugConsoleManager.setLocalVadRmsThresholdChangeCallback((threshold: number) => {
            this.userMediaManager.setVadThresholds({ rmsThreshold: threshold });
        });
        this.userMediaManager.setVadThresholdCallback((config) => {
            this.debugConsoleManager.setLocalVadRmsThreshold(config.rmsThreshold);
        });
        this.userMediaManager.setLearnedVadStateCallback((report) => {
            this.debugConsoleManager.updateLearnedVadState({
                status: report.status,
                probability: report.probability,
                txFrames: report.txFrames,
                rxPredictions: report.rxPredictions,
                message: report.message,
            });
        });
        this.userMediaManager.setVadStateCallback((report: VadStateReport) => {
            this.debugConsoleManager.updateLocalVadState(report.isSpeech);
        });
        if (!this.dialogManager.enableCharacterGaze()) {
            this.userMediaManager.disableVideo();
        }
        this.userMediaManager.getUserMedia((audioTrack: MediaStreamTrack) => {
            this.startRTC(audioTrack);
        }, (videoTrack: MediaStreamTrack) => {
            this.startCharacterGaze(videoTrack);
        }, (err) => {
            this.chatMessageManager.writeErrorMessage(`カメラまたはマイクが見つかりませんでした。 - ${err}`);
        });
    }

    // WebRTC接続を開始する。生成済みローカル音声トラックをRTCPeerConnectionへ渡す。
    startRTC(audioTrack: MediaStreamTrack): void {
        if (!this.rtcConfigManager.config) {
            return;
        }
        // フロント側の入力音量を可視化できるよう、ローカルトラックをデバッグへ渡す。
        this.debugConsoleManager.setLocalAudioTrack(audioTrack);
        this.rtcc = new RTCTalkClient(this.rtcConfigManager.config, audioTrack, this.dialogManager.talkMode());
        this.setTextChannelCallback(this.rtcc);
        this.setTelopChannelCallback(this.rtcc);
        this.rtcc.start();
    }

    // WebRTC接続を停止する。
    stopRTC(): void {
        this.rtcc?.stop();
    }

    // textチャネル受信メッセージをTalkManagerへ連携する。
    private setTextChannelCallback(rtcc: RTCTalkClient): void {
        rtcc.textChannelCallback = (chatMsg: ChatMessage) => {
            this.talkManager.addTextChannelMessage(chatMsg);
        }
    }

    // telopチャネル受信メッセージをTalkManagerへ連携する。
    private setTelopChannelCallback(rtcc: RTCTalkClient): void {
        rtcc.telopChannelCallback = (vcMsg: TelopChannelMessage) => {
            this.talkManager.addTelopChannelMessage(vcMsg);
        }
    }

    // 顔認識を開始し、視線・AutoMute状態をデバッグUIとRTC mute制御へ反映する。
    private startCharacterGaze(videoTrack: MediaStreamTrack): void {
        if (!this.dialogManager.enableCharacterGaze()) { return; }

        const characterGaze = CharacterGaze.getManager();

        characterGaze.initVision();

        const startEye = () => {
            setTimeout(() => {
                if (!characterGaze.modelIsLoaded()) {
                    console.log("Face detector is still loading. wait 1000ms...");
                    startEye();
                } else {
                    console.log("start CharacterGaze");
                    const eyeTargetElement = document.querySelector("#eyeTarget");
                    characterGaze.initCamera(videoTrack, (detects: Detection[]) => {
                        this.debugConsoleManager.updateFaceXLog(characterGaze.targetX());
                        this.debugConsoleManager.updateFaceYLog(characterGaze.targetY());
                        this.debugConsoleManager.updateFacing(characterGaze.facing());
                        if (eyeTargetElement) {
                            if (detects.length > 0) {
                                eyeTargetElement.setAttribute("fill", "hsl(300 100% 50% / 50%)");
                                eyeTargetElement.setAttribute("cx", `${characterGaze.targetX() * 100}%`);
                                eyeTargetElement.setAttribute("cy", `${characterGaze.targetY() * 100}%`);
                            } else {
                                eyeTargetElement.setAttribute("fill", "hsl(300 100% 50% / 0%)");
                            }
                        }
                    });
                }
            }, 1000);
        }
        startEye();

        if (this.dialogManager.enableAutoMute()) {
            characterGaze.arriveCallback = () => {
                this.debugConsoleManager.updateCharacterEyeStatus(true);
                this.rtcc?.setMute(false);
            }
            characterGaze.leaveCallback = () => {
                this.debugConsoleManager.updateCharacterEyeStatus(false);
                this.rtcc?.setMute(true);
            }
        }
    }
}
