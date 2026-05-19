import { frontendLogger } from "../../../shared/logging/appLogger";
import {
    DEFAULT_FILTER_PROFILE,
    VAD_WORKLET_MODULE_URL,
    VENUE_FILTER_PROFILE,
} from "../userMedia/userMediaAudioProfiles";
import type {
    AudioFilterConfig,
    LearnedVadPerformanceMode,
    LearnedVadStateReport,
    LearnedVadTuningConfig,
    VadStateReport,
    VadThresholdConfig,
    VadThresholdMode,
} from "../userMedia/userMediaTypes";
import { UserMediaVadRuntime } from "./userMediaVadRuntime";
import type { VadWorkletMessage } from "./userMediaVadWorklet";

// WebAudioチェーンと音声フィルタをまとめる。
// VADの状態遷移は UserMediaVadRuntime へ委譲し、ここではノード配線だけを持つ。
export class UserMediaAudioProcessor {
    private readonly vadRuntime = new UserMediaVadRuntime();
    private audioContext?: AudioContext;
    private vadGateEnabled = false;
    private outputGainNode?: GainNode;
    private vadNode?: AudioWorkletNode;
    private highpassNode?: BiquadFilterNode;
    private lowpassNode?: BiquadFilterNode;
    private audioFilterProfile: AudioFilterConfig = DEFAULT_FILTER_PROFILE;

    setVadStateCallback(callback: (report: VadStateReport) => void): void {
        this.vadRuntime.setVadStateCallback(callback);
    }

    setVadThresholdCallback(callback: (config: VadThresholdConfig) => void): void {
        this.vadRuntime.setVadThresholdCallback(callback);
    }

    setLearnedVadStateCallback(callback: (report: LearnedVadStateReport) => void): void {
        this.vadRuntime.setLearnedVadStateCallback(callback);
    }

    setVadGateEnabled(enabled: boolean): void {
        this.vadGateEnabled = enabled;
        if (!this.outputGainNode || !this.audioContext) {
            return;
        }
        this.outputGainNode.gain.setTargetAtTime(
            enabled ? 0 : 1,
            this.audioContext.currentTime,
            0.02,
        );
    }

    setVadThresholds(config: Partial<VadThresholdConfig>): void {
        this.vadRuntime.setVadThresholds(config);
    }

    setVadThresholdMode(mode: VadThresholdMode): void {
        this.vadRuntime.setVadThresholdMode(mode);
    }

    getVadThresholdMode(): VadThresholdMode {
        return this.vadRuntime.getVadThresholdMode();
    }

    setLearnedVadTuning(config: Partial<LearnedVadTuningConfig>): void {
        this.vadRuntime.setLearnedVadTuning(config);
    }

    getLearnedVadTuning(): LearnedVadTuningConfig {
        return this.vadRuntime.getLearnedVadTuning();
    }

    setLearnedVadStrictMode(enabled: boolean): void {
        this.vadRuntime.setLearnedVadStrictMode(enabled);
    }

    getLearnedVadStrictMode(): boolean {
        return this.vadRuntime.getLearnedVadStrictMode();
    }

    setLearnedVadPerformanceMode(mode: LearnedVadPerformanceMode): void {
        this.vadRuntime.setLearnedVadPerformanceMode(mode);
    }

    setVenueNoiseModeEnabled(enabled: boolean): void {
        this.audioFilterProfile = enabled ? VENUE_FILTER_PROFILE : DEFAULT_FILTER_PROFILE;
        this.vadRuntime.setVadThresholds(this.audioFilterProfile.vadThreshold);
        this.applyFilterNodes();
    }

    setAudioFilterConfig(config: Partial<Omit<AudioFilterConfig, "vadThreshold">>): void {
        if (config.highpassHz !== undefined && Number.isFinite(config.highpassHz)) {
            this.audioFilterProfile = {
                ...this.audioFilterProfile,
                highpassHz: Math.max(60, Math.min(300, config.highpassHz)),
            };
        }
        if (config.lowpassEnabled !== undefined) {
            this.audioFilterProfile = {
                ...this.audioFilterProfile,
                lowpassEnabled: !!config.lowpassEnabled,
            };
        }
        if (config.lowpassHz !== undefined && Number.isFinite(config.lowpassHz)) {
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
        return this.vadRuntime.getVadThresholds();
    }

    // Rawマイク入力を WebAudio チェーンで加工し、送信用の音声トラックを生成する。
    async buildProcessedAudioTrack(rawTrack: MediaStreamTrack): Promise<MediaStreamTrack> {
        this.dispose();
        const AudioContextCtor = window.AudioContext;
        if (!AudioContextCtor || !("audioWorklet" in AudioContextCtor.prototype)) {
            return rawTrack;
        }

        const context = new AudioContextCtor();
        this.audioContext = context;
        const source = context.createMediaStreamSource(new MediaStream([rawTrack]));
        const gateGain = await this.createVadProcessingChain(context);
        const destination = context.createMediaStreamDestination();

        this.connectAudioNodes({ source, gateGain, destination });
        if (context.state === "suspended") {
            await context.resume();
        }
        return destination.stream.getAudioTracks()[0] ?? rawTrack;
    }

    // AudioContext/Node/Worker を破棄して再初期化可能な状態へ戻す。
    dispose(): void {
        if (this.audioContext) {
            this.audioContext.close().catch((error) => {
                frontendLogger.error("Failed to close audio context.", { error });
            });
        }
        this.audioContext = undefined;
        this.outputGainNode = undefined;
        this.vadNode = undefined;
        this.highpassNode = undefined;
        this.lowpassNode = undefined;
        this.vadRuntime.dispose();
    }

    private async createVadProcessingChain(context: AudioContext): Promise<GainNode> {
        this.highpassNode = this.createHighpassNode(context);
        this.lowpassNode = this.createLowpassNode(context);
        this.applyFilterNodes();

        await context.audioWorklet.addModule(VAD_WORKLET_MODULE_URL);
        const vadNode = new AudioWorkletNode(context, "vad-processor");
        this.vadNode = vadNode;
        this.vadRuntime.attachVadNode(vadNode);

        const gateGain = context.createGain();
        this.outputGainNode = gateGain;
        gateGain.gain.value = this.vadGateEnabled ? 0 : 1;
        vadNode.port.onmessage = (event: MessageEvent<VadWorkletMessage>) => {
            this.handleVadWorkletMessage(event.data, gateGain);
        };
        return gateGain;
    }

    private connectAudioNodes(options: {
        source: MediaStreamAudioSourceNode;
        gateGain: GainNode;
        destination: MediaStreamAudioDestinationNode;
    }): void {
        const highpassNode = this.requireNode(this.highpassNode, "highpass");
        const lowpassNode = this.requireNode(this.lowpassNode, "lowpass");
        const vadNode = this.requireNode(this.vadNode, "vad");
        options.source.connect(highpassNode);
        highpassNode.connect(lowpassNode);
        lowpassNode.connect(vadNode);
        vadNode.connect(options.gateGain);
        options.gateGain.connect(options.destination);
    }

    private handleVadWorkletMessage(data: VadWorkletMessage | undefined, gateGain: GainNode): void {
        const report = this.vadRuntime.handleWorkletMessage(data);
        if (!report || !this.vadGateEnabled || !this.audioContext) {
            return;
        }
        gateGain.gain.setTargetAtTime(report.isSpeech ? 1 : 0, this.audioContext.currentTime, 0.02);
    }

    private createHighpassNode(context: AudioContext): BiquadFilterNode {
        // 低周波ノイズ（空調/振動）を抑えるため、VAD前段にHPFを入れる。
        const highpass = context.createBiquadFilter();
        highpass.type = "highpass";
        highpass.Q.value = Math.SQRT1_2;
        return highpass;
    }

    private createLowpassNode(context: AudioContext): BiquadFilterNode {
        // 高域ノイズ/残響を抑えるLPF。未使用時もチェーンは固定して切替時の再配線を避ける。
        const lowpass = context.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.Q.value = Math.SQRT1_2;
        return lowpass;
    }

    // HPF/LPFノードへ最新設定を適用する。
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

    private requireNode<T>(node: T | undefined, name: string): T {
        if (node === undefined) {
            throw new Error(`Audio processing node is not initialized: ${name}`);
        }
        return node;
    }
}
