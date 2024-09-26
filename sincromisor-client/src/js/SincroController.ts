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
        this.chatMessageManager.writeSystemMessageText("音声認識・合成システムに接続します。");
        this.rtcc = new RTCTalkClient(audioTrack, this.dialogManager.enableSTUN(), this.dialogManager.getStunServerURL());
        this.setTextChannelCallback(this.rtcc);
        this.setTelopChannelCallback(this.rtcc);
        this.setConnectionStateChangeCallback(this.rtcc);
        this.rtcc.start();
    }

    stopRTC() {
        this.rtcc?.stop();
    }

    setCharacterBone(characterBone: CharacterBone) {
        this.characterBone = characterBone;
    }

    private setTextChannelCallback(rtcc: RTCTalkClient) {
        rtcc.textChannelCallback = (tcMsg: TextChannelMessage) => {
            console.log(tcMsg);
            this.talkManager.addTextChannelMessage(tcMsg);
        }
    }

    private setTelopChannelCallback(rtcc: RTCTalkClient) {
        rtcc.telopChannelCallback = (vcMsg: TelopChannelMessage) => {
            this.talkManager.addTelopChannelMessage(vcMsg);
        }
    }

    private setConnectionStateChangeCallback(rtcc: RTCTalkClient) {
        rtcc.connectionStateChangeCallback = (state) => {
            /* new -> checking -> connected、disconnected -> failed */
            switch (state) {
                case "checking":
                    this.chatMessageManager.writeSystemMessageText("音声認識・合成システムへの接続を確認しています。");
                    break;
                case "connected":
                    this.chatMessageManager.writeSystemMessageText("音声認識・合成システムに接続しました。");
                    break;
                case "disconnected":
                    this.chatMessageManager.writeSystemMessageText("音声認識・合成システムから切断されました。");
                    break;
                case "failed":
                    this.chatMessageManager.writeSystemMessageText("音声認識・合成システムへの接続に失敗しました。");
                    break;
                default:
                    this.chatMessageManager.writeSystemMessageText(`Unknown Error - ${state}`);
            }
        }
    }

    private startCharacterGaze(videoTrack: MediaStreamTrack) {
        if (!this.dialogManager.enableCharacterGaze()) { return false; }

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
