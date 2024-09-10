import { RTCTalkClient } from "./RTC/RTCTalkClient";
import { UserMediaManager } from "./RTC/UserMediaManager";
import { CharacterEye } from "./CharacterEye/CharacterEye";
import { ChatMessageManager } from "./Tools/ChatMessageManager";
import { DialogManager } from "./Tools/DialogManager";
import { SincroScene } from "./SincroScene";
import { TalkManager } from "./RTC/TalkManager";
import { CharacterEyeLogger } from "./CharacterEye/EyeLogger";
import { TelopChannelMessage, TextChannelMessage } from "./RTC/RTCMessage";

export class SincroController {
    dialogManager: DialogManager;
    chatMessageManager: ChatMessageManager;
    currentMessageElement: HTMLDivElement | null = null;
    rtcc: RTCTalkClient | null = null;
    sincroScene: SincroScene | null = null;
    talkManager: TalkManager;
    userMediaManager: UserMediaManager;

    constructor(dialogManager: DialogManager, chatMessageManager: ChatMessageManager, talkManager: TalkManager) {
        this.dialogManager = dialogManager;
        this.chatMessageManager = chatMessageManager;
        this.talkManager = talkManager;

        //this.gloriaChan = new GloriaChan();

        this.userMediaManager = new UserMediaManager();
        if (!this.dialogManager.enableGloriaEye()) {
            this.userMediaManager.disableVideo();
        }
        this.userMediaManager.getUserMedia((audioTrack: MediaStreamTrack) => {
            this.startRTC(audioTrack);
        }, (videoTrack: MediaStreamTrack) => {
            this.startGloriaEye(videoTrack);
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

    setTextChannelCallback(rtcc: RTCTalkClient) {
        rtcc.textChannelCallback = (tcMsg:TextChannelMessage) => {
            console.log(tcMsg);
            this.talkManager.addTextChannelMessage(tcMsg);
            if (this.currentMessageElement) {
                this.chatMessageManager.updateSystemMessageText(this.currentMessageElement, tcMsg.resultText);
            } else {
                this.currentMessageElement = this.chatMessageManager.writeSystemMessageText(tcMsg.resultText);
            }
            if (tcMsg.confirmed) {
                this.currentMessageElement = null;
                this.chatMessageManager.removeOldMessage(10);
            }
        }
    }

    setTelopChannelCallback(rtcc: RTCTalkClient) {
        rtcc.telopChannelCallback = (vcMsg:TelopChannelMessage) => {
            this.talkManager.addTelopChannelMessage(vcMsg);
            this.addTelopChar(vcMsg.text);
        }
    }

    setConnectionStateChangeCallback(rtcc: RTCTalkClient) {
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

    startGloriaEye(videoTrack: MediaStreamTrack) {
        if (!this.dialogManager.enableGloriaEye()) { return false; }

        const gloriaEyeVideo: HTMLVideoElement | null = document.querySelector('video#gloriaEyeVideo');
        if (!gloriaEyeVideo) { return; }
        const gloriaEye = new CharacterEye(gloriaEyeVideo);
        const eyeLogger = new CharacterEyeLogger();

        gloriaEye.initVision();

        const startEye = () => {
            setTimeout(() => {
                if (!gloriaEye.modelIsLoaded()) {
                    console.log("Face detector is still loading. wait 1000ms...");
                    startEye();
                } else {
                    console.log("start GloriaEye");
                    const eyeTargetElement = document.querySelector("#eyeTarget");
                    gloriaEye.initCamera(videoTrack, (detects) => {
                        eyeLogger.updateFaceXLog(gloriaEye.targetX());
                        eyeLogger.updateFaceYLog(gloriaEye.targetY());
                        eyeLogger.updateFacing(gloriaEye.facing());
                        //this.gloriaChan.addRigQueue(-gloriaEye.targetX() + 0.5, gloriaEye.targetY() - 0.5);
                        if (eyeTargetElement) {
                            if (detects.length > 0) {
                                eyeTargetElement.setAttribute("fill", "hsl(300 100% 50% / 50%)");
                                eyeTargetElement.setAttribute("cx", `${gloriaEye.targetX() * 100}%`);
                                eyeTargetElement.setAttribute("cy", `${gloriaEye.targetY() * 100}%`);
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
            gloriaEye.arriveCallback = () => {
                eyeLogger.updateCharacterEyeStatus(true);
                this.rtcc?.setMute(false);
            }
            gloriaEye.leaveCallback = () => {
                eyeLogger.updateCharacterEyeStatus(false);
                this.rtcc?.setMute(true);
            }
        }
    }

    addTelopChar(char: string) {
        const telopText: HTMLDivElement | null = document.querySelector("div#obsFooterBox");
        if (!telopText) {
            return;
        }
        const fontSize = parseFloat(window.getComputedStyle(telopText, null).getPropertyValue("font-size"));
        const maxLength = telopText.clientWidth / fontSize - 1;
        while (telopText.innerText.length > maxLength) {
            telopText.innerText = telopText.innerText.slice(1);
        }
        telopText.innerText += (char || "　");
    }
}
