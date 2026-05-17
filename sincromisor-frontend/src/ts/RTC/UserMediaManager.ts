import { frontendLogger } from "../logging/appLogger";
import {
    type LearnedVadStateReport,
    type LearnedVadTuningConfig,
    LearnedVadWorkerClient,
} from "./LearnedVadWorkerClient";

export type { LearnedVadStateReport, LearnedVadTuningConfig } from "./LearnedVadWorkerClient";
export type LearnedVadPerformanceMode = "low_cpu" | "balanced" | "high_accuracy";

export type VadStateReport = {
    isSpeech: boolean;
    rms: number;
    peak: number;
};

export type VadThresholdConfig = {
    rmsThreshold: number;
    peakThreshold: number;
};

export type VadThresholdMode = "manual" | "auto" | "learned";

export type AudioFilterConfig = {
    highpassHz: number;
    lowpassEnabled: boolean;
    lowpassHz: number;
    vadThreshold: VadThresholdConfig;
};

export type AudioConstraintRuntimeApplyReport = {
    key: "autoGainControl" | "noiseSuppression" | "echoCancellation";
    enabled: boolean;
    status: "pending" | "applied" | "failed";
    message?: string;
};

type VadWorkletMessage = {
    type?: string;
    pcm?: unknown;
    sampleRate?: unknown;
    rms?: unknown;
    peak?: unknown;
    isSpeech?: unknown;
};

// マイク/カメラ取得と、送信用音声トラックの前処理（HPF/LPF/VAD/学習VAD連携）を担当する。
// React移行後も UI は controller 経由でこのクラスを操作し、音声処理の実装詳細はここに閉じ込める。
export class UserMediaManager {
    // Worklet更新時にキャッシュ残りで旧実装を掴まないよう、バージョン付きURLで読む。
    private static readonly VAD_WORKLET_MODULE_URL = "/worklets/vad-processor.js?v=20260222a";
    static readonly DEFAULT_VAD_RMS_THRESHOLD = 0.015;
    static readonly DEFAULT_VAD_PEAK_THRESHOLD = 0.06;
    static readonly VENUE_VAD_RMS_THRESHOLD = 0.05;
    static readonly VENUE_VAD_PEAK_THRESHOLD = 0.12;
    private static readonly AUTO_VAD_MIN_RMS_THRESHOLD = 0.005;
    private static readonly AUTO_VAD_MAX_RMS_THRESHOLD = 0.2;
    private static readonly AUTO_VAD_NOISE_FLOOR_ALPHA = 0.08;
    private static readonly AUTO_VAD_MULTIPLIER = 2.2;
    private static readonly AUTO_VAD_OFFSET = 0.003;
    private static readonly AUTO_VAD_UPDATE_INTERVAL_MS = 500;
    // 学習VADプリセット:
    // low_cpu: 推論頻度を抑えて負荷優先
    // balanced: 通常運用向け
    // high_accuracy: 応答性/取りこぼし低減優先（負荷高め）
    private static readonly LEARNED_VAD_TUNING_PRESETS: Record<
        LearnedVadPerformanceMode,
        LearnedVadTuningConfig
    > = {
        low_cpu: {
            onThreshold: 0.0012,
            offThreshold: 0.0006,
            hangoverMs: 160,
            minInferIntervalMs: 140,
            onConsecutiveFrames: 2,
            offConsecutiveFrames: 2,
        },
        balanced: {
            onThreshold: 0.0008,
            offThreshold: 0.0004,
            hangoverMs: 180,
            minInferIntervalMs: 80,
            onConsecutiveFrames: 2,
            offConsecutiveFrames: 2,
        },
        high_accuracy: {
            onThreshold: 0.00055,
            offThreshold: 0.00025,
            hangoverMs: 240,
            minInferIntervalMs: 40,
            onConsecutiveFrames: 3,
            offConsecutiveFrames: 2,
        },
    };
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
    private onVadStateCallback: (report: VadStateReport) => void = () => {};
    private onVadThresholdCallback: (config: VadThresholdConfig) => void = () => {};
    private onLearnedVadStateCallback: (report: LearnedVadStateReport) => void = () => {};
    private onAudioConstraintRuntimeApplyCallback: (
        report: AudioConstraintRuntimeApplyReport,
    ) => void = () => {};
    private audioContext: AudioContext | null = null;
    private rawAudioTrack: MediaStreamTrack | null = null;
    private vadGateEnabled: boolean = false;
    private outputGainNode: GainNode | null = null;
    private vadNode: AudioWorkletNode | null = null;
    private highpassNode: BiquadFilterNode | null = null;
    private lowpassNode: BiquadFilterNode | null = null;
    private learnedVadClient: LearnedVadWorkerClient;
    private audioFilterProfile: AudioFilterConfig = UserMediaManager.DEFAULT_FILTER_PROFILE;
    private vadThresholdMode: VadThresholdMode = "manual";
    private manualVadThresholdConfig: VadThresholdConfig = {
        rmsThreshold: UserMediaManager.DEFAULT_VAD_RMS_THRESHOLD,
        peakThreshold: UserMediaManager.DEFAULT_VAD_PEAK_THRESHOLD,
    };
    private vadThresholdConfig: VadThresholdConfig = {
        rmsThreshold: UserMediaManager.DEFAULT_VAD_RMS_THRESHOLD,
        peakThreshold: UserMediaManager.DEFAULT_VAD_PEAK_THRESHOLD,
    };
    private autoNoiseFloorRms: number = UserMediaManager.DEFAULT_VAD_RMS_THRESHOLD * 0.5;
    private autoLastThresholdApplyAtMs: number = 0;
    private learnedVadStreamRecoveryLastAtMs: number = 0;
    private learnedVadStrictMode: boolean = false;

    constructor() {
        this.config = this.defaultConfig();
        // 学習VAD worker 状態は DebugConsole / React Control Panel に表示するため、
        // コールバック1本に集約して上位へ通知する。
        this.learnedVadClient = new LearnedVadWorkerClient((report: LearnedVadStateReport) => {
            this.onLearnedVadStateCallback(report);
        });
    }

    // ブラウザが getUserMedia に対応しているかを確認する。
    static hasGetUserMedia(): boolean {
        return !!navigator.mediaDevices?.getUserMedia;
    }

    // マイク/カメラの既定制約を返す。騒音環境向けの音声処理設定をここで定義する。
    defaultConfig(): MediaStreamConstraints {
        return {
            /*
                ビデオを有効にし解像度を指定する場合は
                {"width": 320, "height": 240}
            */
            video: { width: 320, height: 240 },
            // イベント会場などの騒音環境を想定し、音声処理を明示指定する。
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                // AGCは環境ノイズを持ち上げることがあるため、まずは無効を既定にする。
                autoGainControl: false,
                channelCount: 1,
                sampleRate: 48000,
                sampleSize: 16,
            },
        };
    }

    // 設定UIで選択されたマイク入力 deviceId を保持し、次回取得制約へ反映する。
    setAudioInputDeviceId(deviceId: string | undefined): void {
        const audioConfig = this.config.audio;
        if (!audioConfig || typeof audioConfig === "boolean") {
            return;
        }
        if (deviceId && deviceId.trim() !== "") {
            audioConfig.deviceId = { exact: deviceId };
            return;
        }
        delete audioConfig.deviceId;
    }

    getAudioInputDeviceId(): string | undefined {
        const audioConfig = this.config.audio;
        if (!audioConfig || typeof audioConfig === "boolean") {
            return undefined;
        }
        const deviceIdConstraint = audioConfig.deviceId;
        if (typeof deviceIdConstraint === "string") {
            return deviceIdConstraint;
        }
        if (
            deviceIdConstraint &&
            typeof deviceIdConstraint === "object" &&
            "exact" in deviceIdConstraint &&
            typeof deviceIdConstraint.exact === "string"
        ) {
            return deviceIdConstraint.exact;
        }
        return undefined;
    }

    // DebugConsole表示用に、AudioWorklet側VADの状態を通知する。
    setVadStateCallback(callback: (report: VadStateReport) => void): void {
        this.onVadStateCallback = callback;
    }

    // DebugConsole表示用に、現在有効なVAD閾値を通知する。
    setVadThresholdCallback(callback: (config: VadThresholdConfig) => void): void {
        this.onVadThresholdCallback = callback;
    }

    // DebugConsole表示用に、学習VADの状態を通知する。
    setLearnedVadStateCallback(callback: (report: LearnedVadStateReport) => void): void {
        this.onLearnedVadStateCallback = callback;
        this.onLearnedVadStateCallback(this.learnedVadClient.getSnapshot());
    }

    // DebugConsole表示用に、NS/EC/AGC の実行中トラック反映結果を通知する。
    setAudioConstraintRuntimeApplyCallback(
        callback: (report: AudioConstraintRuntimeApplyReport) => void,
    ): void {
        this.onAudioConstraintRuntimeApplyCallback = callback;
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
    // manualモードの正本は manualVadThresholdConfig とし、実効値は applyVadThresholds 経由で同期する。
    setVadThresholds(config: Partial<VadThresholdConfig>): void {
        if (config.rmsThreshold != null && Number.isFinite(config.rmsThreshold)) {
            this.manualVadThresholdConfig.rmsThreshold = Math.max(
                0.001,
                Math.min(0.2, config.rmsThreshold),
            );
        }
        if (config.peakThreshold != null && Number.isFinite(config.peakThreshold)) {
            this.manualVadThresholdConfig.peakThreshold = Math.max(
                0.01,
                Math.min(0.99, config.peakThreshold),
            );
        }
        if (this.vadThresholdMode === "manual") {
            this.applyVadThresholds(this.manualVadThresholdConfig);
        }
    }

    // VAD閾値の手動/自動/学習モードを切り替える。
    // learned モード時のみ Worker 推論を有効化し、通常時はCPU負荷を抑える。
    setVadThresholdMode(mode: VadThresholdMode): void {
        this.vadThresholdMode = mode;
        if (mode === "manual") {
            this.applyVadThresholds(this.manualVadThresholdConfig);
            this.setLearnedVadEnabled(false);
            return;
        }
        if (mode === "learned") {
            this.setLearnedVadEnabled(true);
            return;
        }
        this.setLearnedVadEnabled(false);
        this.autoNoiseFloorRms = Math.max(
            UserMediaManager.AUTO_VAD_MIN_RMS_THRESHOLD * 0.5,
            this.vadThresholdConfig.rmsThreshold * 0.5,
        );
        this.autoLastThresholdApplyAtMs = 0;
        const initialAutoRmsThreshold = Math.max(
            UserMediaManager.AUTO_VAD_MIN_RMS_THRESHOLD,
            Math.min(
                UserMediaManager.AUTO_VAD_MAX_RMS_THRESHOLD,
                this.autoNoiseFloorRms * UserMediaManager.AUTO_VAD_MULTIPLIER +
                    UserMediaManager.AUTO_VAD_OFFSET,
            ),
        );
        this.applyVadThresholds({
            rmsThreshold: initialAutoRmsThreshold,
            peakThreshold: this.manualVadThresholdConfig.peakThreshold,
        });
    }

    getVadThresholdMode(): VadThresholdMode {
        return this.vadThresholdMode;
    }

    // 学習VADの推論パラメータ（ON/OFF閾値・hangover・推論間隔）を更新する。
    setLearnedVadTuning(config: Partial<LearnedVadTuningConfig>): void {
        this.learnedVadClient.setTuningConfig(config);
    }

    getLearnedVadTuning(): LearnedVadTuningConfig {
        return this.learnedVadClient.getTuningConfig();
    }

    setLearnedVadStrictMode(enabled: boolean): void {
        // 厳格モードでは learned判定とRMS/Peak判定の両方がSpeechのときのみ通す。
        // 誤反応抑制を優先するため、弱音声は取りこぼしやすくなる。
        this.learnedVadStrictMode = !!enabled;
    }

    getLearnedVadStrictMode(): boolean {
        return this.learnedVadStrictMode;
    }

    // 学習VADのプリセットを適用する。
    setLearnedVadPerformanceMode(mode: LearnedVadPerformanceMode): void {
        const preset = UserMediaManager.LEARNED_VAD_TUNING_PRESETS[mode];
        if (!preset) {
            return;
        }
        this.learnedVadClient.setTuningConfig(preset);
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

    // マイク/カメラを取得し、音声は必要に応じてVAD/フィルタ付きトラックへ差し替えて返す。
    // 呼び出し側（SincroAudioInputController）はここから返る track をそのまま RTC に渡す。
    getUserMedia(
        audioTrackCallback: (audioTrack: MediaStreamTrack) => void,
        videoTrackCallback: (videoTrack: MediaStreamTrack) => void,
        errCallback: (err: unknown) => void,
    ): void {
        navigator.mediaDevices
            .getUserMedia(this.config)
            .then(async (mediaStream) => {
                for (const track of mediaStream.getTracks()) {
                    if (track.kind === "audio") {
                        frontendLogger.info("Audio track acquired.");
                        this.rawAudioTrack = track;
                        this.audioTrack = await this.buildProcessedAudioTrack(track);
                        audioTrackCallback(this.audioTrack);
                    } else if (track.kind === "video") {
                        frontendLogger.info("Video track acquired.");
                        this.videoTrack = track;
                        videoTrackCallback(this.videoTrack);
                    } else {
                        frontendLogger.warn("Unknown media track acquired.", { kind: track.kind });
                    }
                }
            })
            .catch((err) => {
                frontendLogger.error("Could not acquire media.", { error: err });
                errCallback(err);
            });
    }

    // 実行中のマイク入力を再取得し、処理済み送信用トラックへ差し替える。
    // RTC 側の replaceTrack と組み合わせて、セッションを維持したままデバイス切替できるようにする。
    async reacquireAudioTrack(): Promise<MediaStreamTrack> {
        const previousProcessedTrack = this.audioTrack;
        const previousRawTrack = this.rawAudioTrack;
        const previousEnabled = previousProcessedTrack?.enabled ?? true;
        const audioConfig = this.config.audio;
        const nextStream = await navigator.mediaDevices.getUserMedia({
            audio: typeof audioConfig === "boolean" ? audioConfig : { ...audioConfig },
            video: false,
        });
        const nextRawTrack = nextStream.getAudioTracks()[0];
        if (!nextRawTrack) {
            throw new Error("選択されたマイク入力デバイスから音声トラックを取得できませんでした。");
        }

        try {
            const nextProcessedTrack = await this.buildProcessedAudioTrack(nextRawTrack);
            nextProcessedTrack.enabled = previousEnabled;
            this.rawAudioTrack = nextRawTrack;
            this.audioTrack = nextProcessedTrack;
            previousProcessedTrack?.stop();
            if (previousRawTrack && previousRawTrack !== previousProcessedTrack) {
                previousRawTrack.stop();
            }
            return nextProcessedTrack;
        } catch (error) {
            nextRawTrack.stop();
            throw error;
        }
    }

    // Rawマイク入力を WebAudio チェーンで加工し、送信用の音声トラックを生成する。
    // WorkletVAD / learned VAD / ゲート制御はこのチェーンに集約し、上位層に漏らさない。
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
        highpass.Q.value = Math.SQRT1_2;
        this.highpassNode = highpass;
        // 高域ノイズ/残響を抑えるLPF。未使用時もチェーンは固定して切替時の再配線を避ける。
        const lowpass = context.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.Q.value = Math.SQRT1_2;
        this.lowpassNode = lowpass;
        this.applyFilterNodes();

        await context.audioWorklet.addModule(UserMediaManager.VAD_WORKLET_MODULE_URL);
        const vadNode = new AudioWorkletNode(context, "vad-processor");
        this.vadNode = vadNode;
        this.postVadThresholds();
        const gateGain = context.createGain();
        this.outputGainNode = gateGain;
        gateGain.gain.value = this.vadGateEnabled ? 0 : 1;
        // AudioWorklet -> main thread の VADメトリクス受信点。
        // DebugConsole表示更新と learned VAD へのフレーム転送制御の両方をここで行う。
        vadNode.port.onmessage = (event: MessageEvent<VadWorkletMessage>) => {
            const data = event.data;
            if (!data) {
                return;
            }
            const hasPcmPayload = data.pcm != null;
            if (data.type === "audio-frame" || hasPcmPayload) {
                const pcm = this.normalizePcmFrame(data.pcm);
                const sampleRate = Number(data.sampleRate) || 48000;
                if (pcm && pcm.length > 0) {
                    this.learnedVadClient.postAudioFrame(pcm, sampleRate);
                }
                return;
            }
            if (data.type !== "vad") {
                return;
            }
            const fallbackVadReport = {
                isSpeech: !!data.isSpeech,
                rms: Number(data.rms) || 0,
                peak: Number(data.peak) || 0,
            };
            this.updateAutoVadThreshold(fallbackVadReport);
            if (
                this.vadThresholdMode === "learned" &&
                !this.learnedVadClient.hasValidPrediction()
            ) {
                const now = performance.now();
                if (now - this.learnedVadStreamRecoveryLastAtMs >= 1000) {
                    this.learnedVadClient.syncAudioFrameStreaming(this.vadNode, true, true);
                    this.learnedVadStreamRecoveryLastAtMs = now;
                }
            }
            // 学習VADでまだ確率が返っていない間は、RMS/Peak判定をフォールバックに使って送信停止を避ける。
            const speechState =
                this.vadThresholdMode === "learned"
                    ? this.learnedVadClient.hasValidPrediction()
                        ? this.learnedVadStrictMode
                            ? this.learnedVadClient.getSpeechState() && fallbackVadReport.isSpeech
                            : this.learnedVadClient.getSpeechState()
                        : fallbackVadReport.isSpeech
                    : fallbackVadReport.isSpeech;
            if (this.vadGateEnabled && this.audioContext) {
                const nextGain = speechState ? 1 : 0;
                gateGain.gain.setTargetAtTime(nextGain, this.audioContext.currentTime, 0.02);
            }
            this.onVadStateCallback({
                isSpeech: speechState,
                rms: fallbackVadReport.rms,
                peak: fallbackVadReport.peak,
            });
        };
        this.syncLearnedVadStreamState();

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

    // AudioWorkletからのPCMをブラウザ差異に依存しない形で正規化する。
    private normalizePcmFrame(raw: unknown): Float32Array | null {
        if (raw instanceof Float32Array) {
            return raw;
        }
        if (raw instanceof ArrayBuffer) {
            return new Float32Array(raw);
        }
        if (ArrayBuffer.isView(raw)) {
            const view = raw as ArrayBufferView;
            return new Float32Array(
                view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength),
            );
        }
        if (Array.isArray(raw)) {
            const values = raw.map((v) => Number(v));
            if (values.some((v) => !Number.isFinite(v))) {
                return null;
            }
            return Float32Array.from(values);
        }
        return null;
    }

    // 設定ダイアログのAGC設定を getUserMedia 制約へ反映する。
    setAutoGainControl(enabled: boolean): void {
        this.updateAudioBooleanConstraint("autoGainControl", enabled);
    }

    // 設定ダイアログのノイズ抑制設定を getUserMedia 制約へ反映する。
    setNoiseSuppression(enabled: boolean): void {
        this.updateAudioBooleanConstraint("noiseSuppression", enabled);
    }

    // 設定ダイアログのエコーキャンセル設定を getUserMedia 制約へ反映する。
    setEchoCancellation(enabled: boolean): void {
        this.updateAudioBooleanConstraint("echoCancellation", enabled);
    }

    // 音声制約の boolean パラメータ更新を共通化する。
    private updateAudioBooleanConstraint(
        key: "autoGainControl" | "noiseSuppression" | "echoCancellation",
        enabled: boolean,
    ): void {
        const audioConfig = this.config.audio;
        if (!audioConfig || typeof audioConfig === "boolean") {
            return;
        }
        audioConfig[key] = enabled;
        // 取得済みの生マイクトラックがある場合は、可能な範囲で実行中トラックにも反映する。
        // ブラウザ/デバイス依存で未対応な場合があるため、失敗しても設定保持だけは継続する。
        const rawTrack = this.rawAudioTrack;
        if (!rawTrack) {
            this.onAudioConstraintRuntimeApplyCallback({
                key,
                enabled,
                status: "pending",
                message: "マイク開始後に適用",
            });
            return;
        }
        void rawTrack
            .applyConstraints({ [key]: enabled } as MediaTrackConstraints)
            .then(() => {
                this.onAudioConstraintRuntimeApplyCallback({
                    key,
                    enabled,
                    status: "applied",
                });
            })
            .catch((err) => {
                frontendLogger.warn("Failed to apply audio constraint to running track.", {
                    key,
                    error: err,
                });
                this.onAudioConstraintRuntimeApplyCallback({
                    key,
                    enabled,
                    status: "failed",
                    message: err instanceof Error ? err.message : String(err),
                });
            });
    }

    // 顔認識機能未使用時などにカメラ取得を無効化する。
    disableVideo(): void {
        this.config.video = false;
    }

    // AudioContext/Node/Worker を破棄して再初期化可能な状態へ戻す。
    private disposeAudioProcessing(): void {
        if (!this.audioContext) {
            return;
        }
        this.audioContext.close().catch((e) => {
            frontendLogger.error("Failed to close audio context.", { error: e });
        });
        this.audioContext = null;
        this.outputGainNode = null;
        this.vadNode = null;
        this.highpassNode = null;
        this.lowpassNode = null;
        this.learnedVadClient.dispose();
    }

    // 現在有効なVAD閾値を AudioWorklet へ送信し、UIにも通知する。
    private postVadThresholds(): void {
        if (!this.vadNode) {
            return;
        }
        this.vadNode.port.postMessage({
            type: "vad-threshold",
            rmsThreshold: this.vadThresholdConfig.rmsThreshold,
            peakThreshold: this.vadThresholdConfig.peakThreshold,
        });
        this.onVadThresholdCallback({ ...this.vadThresholdConfig });
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

    // learned VADの有効化を切替え、必要なら音声フレーム転送状態も同期する。
    private setLearnedVadEnabled(enabled: boolean): void {
        this.learnedVadClient.setEnabled(enabled);
        this.syncLearnedVadStreamState();
    }

    // 学習VADモード時のみ AudioWorklet -> Worker のフレーム転送を有効化する。
    private syncLearnedVadStreamState(): void {
        const shouldEnable = this.vadThresholdMode === "learned";
        this.learnedVadClient.syncAudioFrameStreaming(this.vadNode, shouldEnable);
        if (!shouldEnable) {
            this.learnedVadStreamRecoveryLastAtMs = 0;
        }
    }

    // VAD閾値を安全範囲に丸めて反映する。
    private applyVadThresholds(config: VadThresholdConfig): void {
        this.vadThresholdConfig = {
            rmsThreshold: Math.max(0.001, Math.min(0.2, config.rmsThreshold)),
            peakThreshold: Math.max(0.01, Math.min(0.99, config.peakThreshold)),
        };
        this.postVadThresholds();
    }

    // autoモード用: 無音時RMSからノイズフロアを追従し、一定周期で閾値を更新する。
    private updateAutoVadThreshold(report: { isSpeech: boolean; rms: number }): void {
        if (this.vadThresholdMode !== "auto") {
            return;
        }
        if (!report.isSpeech) {
            const nextFloor =
                this.autoNoiseFloorRms * (1 - UserMediaManager.AUTO_VAD_NOISE_FLOOR_ALPHA) +
                report.rms * UserMediaManager.AUTO_VAD_NOISE_FLOOR_ALPHA;
            this.autoNoiseFloorRms = Math.max(0, Math.min(1, nextFloor));
        }

        const now = performance.now();
        if (now - this.autoLastThresholdApplyAtMs < UserMediaManager.AUTO_VAD_UPDATE_INTERVAL_MS) {
            return;
        }
        const nextRmsThreshold = Math.max(
            UserMediaManager.AUTO_VAD_MIN_RMS_THRESHOLD,
            Math.min(
                UserMediaManager.AUTO_VAD_MAX_RMS_THRESHOLD,
                this.autoNoiseFloorRms * UserMediaManager.AUTO_VAD_MULTIPLIER +
                    UserMediaManager.AUTO_VAD_OFFSET,
            ),
        );
        if (Math.abs(nextRmsThreshold - this.vadThresholdConfig.rmsThreshold) < 0.001) {
            return;
        }
        this.autoLastThresholdApplyAtMs = now;
        this.applyVadThresholds({
            rmsThreshold: nextRmsThreshold,
            peakThreshold: this.manualVadThresholdConfig.peakThreshold,
        });
    }

    // 取得したメディアトラックと音声処理リソースを停止する。
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
