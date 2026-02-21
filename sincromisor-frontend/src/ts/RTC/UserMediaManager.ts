export type VadStateReport = {
    isSpeech: boolean;
    rms: number;
    peak: number;
};

export class UserMediaManager {
    audioTrack?: MediaStreamTrack;
    videoTrack?: MediaStreamTrack;
    config: MediaStreamConstraints;
    private onVadStateCallback: (report: VadStateReport) => void = () => { };
    private audioContext: AudioContext | null = null;
    private rawAudioTrack: MediaStreamTrack | null = null;

    constructor() {
        this.config = this.defaultConfig();
    }

    static hasGetUserMedia(): boolean {
        return !!navigator.mediaDevices?.getUserMedia;
    }

    defaultConfig(): MediaStreamConstraints {
        return {
            /*
                ビデオを有効にし解像度を指定する場合は
                {"width": 320, "height": 240}
            */
            "video": { "width": 320, "height": 240 },
            // イベント会場などの騒音環境を想定し、音声処理を明示指定する。
            "audio": {
                "echoCancellation": true,
                "noiseSuppression": true,
                // AGCは環境ノイズを持ち上げることがあるため、まずは無効を既定にする。
                "autoGainControl": false,
                "channelCount": 1,
                "sampleRate": 48000,
                "sampleSize": 16
            }
        }
    }

    // DebugConsole表示用に、AudioWorklet側VADの状態を通知する。
    setVadStateCallback(callback: (report: VadStateReport) => void): void {
        this.onVadStateCallback = callback;
    }

    getUserMedia(audioTrackCallback: (audioTrack: MediaStreamTrack) => void,
        videoTrackCallback: (videoTrack: MediaStreamTrack) => void,
        errCallback: (err: any) => void): void {
        navigator.mediaDevices.getUserMedia(this.config)
            .then(async (mediaStream) => {
                for (const track of mediaStream.getTracks()) {
                    if (track.kind == 'audio') {
                        console.log(`AudioTrack: ${track.label}`);
                        this.rawAudioTrack = track;
                        this.audioTrack = await this.buildProcessedAudioTrack(track);
                        audioTrackCallback(this.audioTrack);
                    } else if (track.kind == 'video') {
                        console.log(`VideoTrack: ${track.label}`);
                        this.videoTrack = track;
                        videoTrackCallback(this.videoTrack);
                    } else {
                        console.error(`Unknown Track: ${track}`);
                    }
                }
            }).catch((err) => {
                console.error(`Could not acquire media: ${err}`);
                errCallback(err);
            })
    }

    private async buildProcessedAudioTrack(rawTrack: MediaStreamTrack): Promise<MediaStreamTrack> {
        this.disposeAudioProcessing();
        const AudioContextCtor = window.AudioContext;
        if (!AudioContextCtor || !("audioWorklet" in AudioContextCtor.prototype)) {
            return rawTrack;
        }

        const context = new AudioContextCtor();
        this.audioContext = context;
        const source = context.createMediaStreamSource(new MediaStream([rawTrack]));

        // 低周波ノイズ（空調/振動）を抑えるため、VAD前段にHPFを入れる。
        const highpass = context.createBiquadFilter();
        highpass.type = "highpass";
        highpass.frequency.value = 120;
        highpass.Q.value = 0.707;

        await context.audioWorklet.addModule("/worklets/vad-processor.js");
        const vadNode = new AudioWorkletNode(context, "vad-processor");
        vadNode.port.onmessage = (event: MessageEvent<{ type: string; isSpeech: boolean; rms: number; peak: number; }>) => {
            const data = event.data;
            if (!data || data.type !== "vad") {
                return;
            }
            this.onVadStateCallback({
                isSpeech: !!data.isSpeech,
                rms: Number(data.rms) || 0,
                peak: Number(data.peak) || 0,
            });
        };

        const destination = context.createMediaStreamDestination();
        source.connect(highpass);
        highpass.connect(vadNode);
        vadNode.connect(destination);

        if (context.state === "suspended") {
            await context.resume();
        }
        const processedTrack = destination.stream.getAudioTracks()[0];
        if (!processedTrack) {
            return rawTrack;
        }
        return processedTrack;
    }

    setAutoGainControl(enabled: boolean): void {
        this.updateAudioBooleanConstraint("autoGainControl", enabled);
    }

    setNoiseSuppression(enabled: boolean): void {
        this.updateAudioBooleanConstraint("noiseSuppression", enabled);
    }

    setEchoCancellation(enabled: boolean): void {
        this.updateAudioBooleanConstraint("echoCancellation", enabled);
    }

    private updateAudioBooleanConstraint(
        key: "autoGainControl" | "noiseSuppression" | "echoCancellation",
        enabled: boolean,
    ): void {
        const audioConfig = this.config.audio;
        if (!audioConfig || typeof audioConfig === "boolean") {
            return;
        }
        audioConfig[key] = enabled;
    }

    disableVideo(): void {
        this.config["video"] = false;
    }

    private disposeAudioProcessing(): void {
        if (!this.audioContext) {
            return;
        }
        this.audioContext.close().catch((e) => {
            console.error(e);
        });
        this.audioContext = null;
    }

    close(): void {
        if (this.videoTrack) {
            this.videoTrack.stop();
        }
        if (this.audioTrack) {
            this.audioTrack.stop();
        }
        if (this.rawAudioTrack && this.rawAudioTrack !== this.audioTrack) {
            this.rawAudioTrack.stop();
        }
        this.disposeAudioProcessing();
    }
}

/*
    medisStreamTrack = {
        "enabled": true, // 一般的な意味でのmuteはこちらを操作
        "id": "{5b26b865-8350-45f3-b3bf-bd2535384246}",
        "kind": "audio",
        "label": "マイク (webcam Audio)",
        "muted": false, // 「技術的な問題でこのトラックがメディアデータを提供できないかどうかを示す論理値」
        "onended": null,
        "onmute": null,
        "onunmute": null,
        "readyState": "live"
    }
*/
