import { RTCTalkClient } from "./RTC/RTCTalkClient";
import { UserMediaManager } from "./RTC/UserMediaManager";
import { CharacterGaze } from "./CharacterGaze/CharacterGaze";
import { ChatMessageManager } from "./UI/ChatMessageManager";
import { DialogManager } from "./UI/DialogManager";
import { TalkManager } from "./RTC/TalkManager";
import { DebugConsoleManager } from "./UI/DebugConsoleManager";
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

    startRTC(audioTrack: MediaStreamTrack): void {
        if (!this.rtcConfigManager.config) {
            return;
        }
        this.rtcc = new RTCTalkClient(this.rtcConfigManager.config, audioTrack, this.dialogManager.talkMode());
        this.setTextChannelCallback(this.rtcc);
        this.setTelopChannelCallback(this.rtcc);
        this.rtcc.start();
    }

    stopRTC(): void {
        this.rtcc?.stop();
    }

    private setTextChannelCallback(rtcc: RTCTalkClient): void {
        rtcc.textChannelCallback = (chatMsg: ChatMessage) => {
            this.talkManager.addTextChannelMessage(chatMsg);
        }
    }

    private setTelopChannelCallback(rtcc: RTCTalkClient): void {
        rtcc.telopChannelCallback = (vcMsg: TelopChannelMessage) => {
            this.talkManager.addTelopChannelMessage(vcMsg);
        }
    }

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
