export type VadStateReport = {
    isSpeech: boolean;
    rms: number;
    peak: number;
};

export type VadThresholdConfig = {
    rmsThreshold: number;
    peakThreshold: number;
};

export type AudioFilterConfig = {
    highpassHz: number;
    lowpassEnabled: boolean;
    lowpassHz: number;
    vadThreshold: VadThresholdConfig;
};

export class UserMediaManager {
    static readonly DEFAULT_VAD_RMS_THRESHOLD = 0.015;
    static readonly DEFAULT_VAD_PEAK_THRESHOLD = 0.06;
    static readonly VENUE_VAD_RMS_THRESHOLD = 0.05;
    static readonly VENUE_VAD_PEAK_THRESHOLD = 0.12;
    private static readonly DEFAULT_FILTER_PROFILE: AudioFilterConfig = {
        highpassHz: 120,
        lowpassEnabled: false,
        lowpassHz: 4200,
        vadThreshold: {
            rmsThreshold: UserMediaManager.DEFAULT_VAD_RMS_THRESHOLD,
            peakThreshold: UserMediaManager.DEFAULT_VAD_PEAK_THRESHOLD,
        },
    };
    private static readonly VENUE_FILTER_PROFILE: AudioFilterConfig = {
        highpassHz: 180,
        lowpassEnabled: true,
        lowpassHz: 4200,
        vadThreshold: {
            rmsThreshold: UserMediaManager.VENUE_VAD_RMS_THRESHOLD,
            peakThreshold: UserMediaManager.VENUE_VAD_PEAK_THRESHOLD,
        },
    };

    audioTrack?: MediaStreamTrack;
    videoTrack?: MediaStreamTrack;
    config: MediaStreamConstraints;
    private onVadStateCallback: (report: VadStateReport) => void = () => { };
    private audioContext: AudioContext | null = null;
    private rawAudioTrack: MediaStreamTrack | null = null;
    private vadGateEnabled: boolean = false;
    private outputGainNode: GainNode | null = null;
    private vadNode: AudioWorkletNode | null = null;
    private highpassNode: BiquadFilterNode | null = null;
    private lowpassNode: BiquadFilterNode | null = null;
    private audioFilterProfile: AudioFilterConfig = UserMediaManager.DEFAULT_FILTER_PROFILE;
    private vadThresholdConfig: VadThresholdConfig = {
        rmsThreshold: UserMediaManager.DEFAULT_VAD_RMS_THRESHOLD,
        peakThreshold: UserMediaManager.DEFAULT_VAD_PEAK_THRESHOLD,
    };

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

    // VAD判定に連動して無音時の送信音量を0にするかを切り替える。
    setVadGateEnabled(enabled: boolean): void {
        this.vadGateEnabled = enabled;
        if (!this.outputGainNode || !this.audioContext) {
            return;
        }
        const nextGain = enabled ? 0 : 1;
        this.outputGainNode.gain.setTargetAtTime(nextGain, this.audioContext.currentTime, 0.02);
    }

    // VADの閾値を更新し、処理中であればAudioWorkletへ即時反映する。
    setVadThresholds(config: Partial<VadThresholdConfig>): void {
        if (config.rmsThreshold != null && Number.isFinite(config.rmsThreshold)) {
            this.vadThresholdConfig.rmsThreshold = Math.max(0.001, Math.min(0.2, config.rmsThreshold));
        }
        if (config.peakThreshold != null && Number.isFinite(config.peakThreshold)) {
            this.vadThresholdConfig.peakThreshold = Math.max(0.01, Math.min(0.99, config.peakThreshold));
        }
        this.postVadThresholds();
    }

    // 騒音会場向けの強フィルタプロファイルを切り替える。
    setVenueNoiseModeEnabled(enabled: boolean): void {
        this.audioFilterProfile = enabled
            ? UserMediaManager.VENUE_FILTER_PROFILE
            : UserMediaManager.DEFAULT_FILTER_PROFILE;
        this.setVadThresholds(this.audioFilterProfile.vadThreshold);
        this.applyFilterNodes();
    }

    // HPF/LPF設定を更新し、処理中であればフィルタへ即時反映する。
    setAudioFilterConfig(config: Partial<Omit<AudioFilterConfig, "vadThreshold">>): void {
        if (config.highpassHz != null && Number.isFinite(config.highpassHz)) {
            this.audioFilterProfile = {
                ...this.audioFilterProfile,
                highpassHz: Math.max(60, Math.min(300, config.highpassHz)),
            };
        }
        if (config.lowpassEnabled != null) {
            this.audioFilterProfile = {
                ...this.audioFilterProfile,
                lowpassEnabled: !!config.lowpassEnabled,
            };
        }
        if (config.lowpassHz != null && Number.isFinite(config.lowpassHz)) {
            this.audioFilterProfile = {
                ...this.audioFilterProfile,
                lowpassHz: Math.max(2500, Math.min(10000, config.lowpassHz)),
            };
        }
        this.applyFilterNodes();
    }

    getAudioFilterConfig(): Omit<AudioFilterConfig, "vadThreshold"> {
        return {
            highpassHz: this.audioFilterProfile.highpassHz,
            lowpassEnabled: this.audioFilterProfile.lowpassEnabled,
            lowpassHz: this.audioFilterProfile.lowpassHz,
        };
    }

    getVadThresholds(): VadThresholdConfig {
        return { ...this.vadThresholdConfig };
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
        highpass.Q.value = 0.707;
        this.highpassNode = highpass;
        // 高域ノイズ/残響を抑えるLPF。未使用時もチェーンは固定して切替時の再配線を避ける。
        const lowpass = context.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.Q.value = 0.707;
        this.lowpassNode = lowpass;
        this.applyFilterNodes();

        await context.audioWorklet.addModule("/worklets/vad-processor.js");
        const vadNode = new AudioWorkletNode(context, "vad-processor");
        this.vadNode = vadNode;
        this.postVadThresholds();
        const gateGain = context.createGain();
        this.outputGainNode = gateGain;
        gateGain.gain.value = this.vadGateEnabled ? 0 : 1;
        vadNode.port.onmessage = (event: MessageEvent<{ type: string; isSpeech: boolean; rms: number; peak: number; }>) => {
            const data = event.data;
            if (!data || data.type !== "vad") {
                return;
            }
            if (this.vadGateEnabled && this.audioContext) {
                const nextGain = data.isSpeech ? 1 : 0;
                gateGain.gain.setTargetAtTime(nextGain, this.audioContext.currentTime, 0.02);
            }
            this.onVadStateCallback({
                isSpeech: !!data.isSpeech,
                rms: Number(data.rms) || 0,
                peak: Number(data.peak) || 0,
            });
        };

        const destination = context.createMediaStreamDestination();
        source.connect(highpass);
        highpass.connect(lowpass);
        lowpass.connect(vadNode);
        vadNode.connect(gateGain);
        gateGain.connect(destination);

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
        this.outputGainNode = null;
        this.vadNode = null;
        this.highpassNode = null;
        this.lowpassNode = null;
    }

    private postVadThresholds(): void {
        if (!this.vadNode) {
            return;
        }
        this.vadNode.port.postMessage({
            type: "vad-threshold",
            rmsThreshold: this.vadThresholdConfig.rmsThreshold,
            peakThreshold: this.vadThresholdConfig.peakThreshold,
        });
    }

    private applyFilterNodes(): void {
        if (this.highpassNode) {
            this.highpassNode.frequency.value = this.audioFilterProfile.highpassHz;
        }
        if (this.lowpassNode) {
            this.lowpassNode.frequency.value = this.audioFilterProfile.lowpassEnabled
                ? this.audioFilterProfile.lowpassHz
                : 20000;
        }
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
