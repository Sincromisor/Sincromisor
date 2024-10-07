import { RTCTalkClient } from "./RTC/RTCTalkClient";
import { UserMediaManager } from "./RTC/UserMediaManager";
import { CharacterGaze } from "./CharacterGaze/CharacterGaze";
import { ChatMessageManager } from "./UI/ChatMessageManager";
import { DialogManager } from "./UI/DialogManager";
import { TalkManager } from "./RTC/TalkManager";
import { DebugConsoleManager } from "./UI/DebugConsoleManager";
import { TelopChannelMessage, TextChannelMessage } from "./RTC/RTCMessage";
import { CharacterBone } from "./Character/CharacterBone";

export class SincroController {
    dialogManager: DialogManager;
    chatMessageManager: ChatMessageManager;
    currentMessageElement: HTMLDivElement | null = null;
    rtcc: RTCTalkClient | null = null;
    talkManager: TalkManager;
    userMediaManager: UserMediaManager;
    characterBone: CharacterBone | null = null;

    constructor() {
        this.dialogManager = DialogManager.getManager();
        this.chatMessageManager = ChatMessageManager.getManager();
        this.talkManager = TalkManager.getManager();

        this.userMediaManager = new UserMediaManager();
        if (!this.dialogManager.enableCharacterGaze()) {
            this.userMediaManager.disableVideo();
        }
        this.userMediaManager.getUserMedia((audioTrack: MediaStreamTrack) => {
            this.startRTC(audioTrack);
        }, (videoTrack: MediaStreamTrack) => {
            this.startCharacterGaze(videoTrack);
        }, (err) => {
            this.chatMessageManager.writeSystemMessageText(`カメラまたはマイクが見つかりませんでした。 - ${err}`);
        });
    }

    startRTC(audioTrack: MediaStreamTrack): void {
        this.rtcc = new RTCTalkClient(audioTrack);
        this.setTextChannelCallback(this.rtcc);
        this.setTelopChannelCallback(this.rtcc);
        this.rtcc.start();
    }

    stopRTC(): void {
        this.rtcc?.stop();
    }

    setCharacterBone(characterBone: CharacterBone): void {
        this.characterBone = characterBone;
    }

    private setTextChannelCallback(rtcc: RTCTalkClient): void {
        rtcc.textChannelCallback = (tcMsg: TextChannelMessage) => {
            this.talkManager.addTextChannelMessage(tcMsg);
        }
    }

    private setTelopChannelCallback(rtcc: RTCTalkClient): void {
        rtcc.telopChannelCallback = (vcMsg: TelopChannelMessage) => {
            this.talkManager.addTelopChannelMessage(vcMsg);
        }
    }

    private startCharacterGaze(videoTrack: MediaStreamTrack): void {
        if (!this.dialogManager.enableCharacterGaze()) { return; }

        const chracterGazeVideo: HTMLVideoElement | null = document.querySelector('video#characterGazeVideo');
        if (!chracterGazeVideo) { return; }
        const characterGaze = new CharacterGaze(chracterGazeVideo);
        const eyeLogger = DebugConsoleManager.getManager();

        characterGaze.initVision();

        const startEye = () => {
            setTimeout(() => {
                if (!characterGaze.modelIsLoaded()) {
                    console.log("Face detector is still loading. wait 1000ms...");
                    startEye();
                } else {
                    console.log("start CharacterGaze");
                    const eyeTargetElement = document.querySelector("#eyeTarget");
                    characterGaze.initCamera(videoTrack, (detects) => {
                        eyeLogger.updateFaceXLog(characterGaze.targetX());
                        eyeLogger.updateFaceYLog(characterGaze.targetY());
                        eyeLogger.updateFacing(characterGaze.facing());
                        const eyeAngles = characterGaze.eyeAngles();
                        // 縦方向
                        const eyeAngleX = eyeAngles[1] * (Math.PI / 180);
                        // 横方向
                        const eyeAngleY = -eyeAngles[0] * (Math.PI / 180);
                        this.characterBone?.setEyeTarget(eyeAngleX, eyeAngleY, 0);
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
                eyeLogger.updateCharacterEyeStatus(true);
                this.rtcc?.setMute(false);
            }
            characterGaze.leaveCallback = () => {
                eyeLogger.updateCharacterEyeStatus(false);
                this.rtcc?.setMute(true);
            }
        }
    }
}
