import { frontendLogger } from "../logging/appLogger";
import { UserMediaAudioProcessor } from "./UserMediaAudioProcessor";
import {
    type AudioBooleanConstraintKey,
    applyAudioBooleanConstraintToTrack,
    getAudioInputDeviceIdFromConfig,
    setAudioBooleanConstraintInConfig,
    setAudioInputDeviceIdInConfig,
} from "./userMediaConstraints";
import { createDefaultUserMediaConfig } from "./userMediaDefaultConfig";
import {
    acquireRawAudioTrack,
    installMediaStreamTracks,
    stopPreviousAudioTracks,
    stopTrack,
} from "./userMediaTrackLifecycle";
import type {
    AudioConstraintRuntimeApplyReport,
    AudioFilterConfig,
    LearnedVadPerformanceMode,
    LearnedVadStateReport,
    LearnedVadTuningConfig,
    VadStateReport,
    VadThresholdConfig,
    VadThresholdMode,
} from "./userMediaTypes";

export type { LearnedVadStateReport, LearnedVadTuningConfig } from "./LearnedVadWorkerClient";
export type {
    AudioConstraintRuntimeApplyReport,
    AudioFilterConfig,
    LearnedVadPerformanceMode,
    VadStateReport,
    VadThresholdConfig,
    VadThresholdMode,
} from "./userMediaTypes";

// マイク/カメラ取得と、送信用音声トラックの前処理入口を担当する。
// WebAudio/VADの詳細は UserMediaAudioProcessor に委譲し、このクラスは track lifecycle に集中する。
export class UserMediaManager {
    audioTrack?: MediaStreamTrack;
    videoTrack?: MediaStreamTrack;
    config: MediaStreamConstraints;
    private readonly audioProcessor: UserMediaAudioProcessor;
    private onAudioConstraintRuntimeApplyCallback: (
        report: AudioConstraintRuntimeApplyReport,
    ) => void = () => {};
    private rawAudioTrack?: MediaStreamTrack;

    constructor() {
        this.config = this.defaultConfig();
        this.audioProcessor = new UserMediaAudioProcessor();
    }

    // ブラウザが getUserMedia に対応しているかを確認する。
    static hasGetUserMedia(): boolean {
        return !!navigator.mediaDevices?.getUserMedia;
    }

    // マイク/カメラの既定制約を返す。騒音環境向けの音声処理設定をここで定義する。
    defaultConfig(): MediaStreamConstraints {
        return createDefaultUserMediaConfig();
    }

    // 設定UIで選択されたマイク入力 deviceId を保持し、次回取得制約へ反映する。
    setAudioInputDeviceId(deviceId: string | undefined): void {
        setAudioInputDeviceIdInConfig(this.config, deviceId);
    }

    getAudioInputDeviceId(): string | undefined {
        return getAudioInputDeviceIdFromConfig(this.config);
    }

    // DebugConsole表示用に、AudioWorklet側VADの状態を通知する。
    setVadStateCallback(callback: (report: VadStateReport) => void): void {
        this.audioProcessor.setVadStateCallback(callback);
    }

    // DebugConsole表示用に、現在有効なVAD閾値を通知する。
    setVadThresholdCallback(callback: (config: VadThresholdConfig) => void): void {
        this.audioProcessor.setVadThresholdCallback(callback);
    }

    // DebugConsole表示用に、学習VADの状態を通知する。
    setLearnedVadStateCallback(callback: (report: LearnedVadStateReport) => void): void {
        this.audioProcessor.setLearnedVadStateCallback(callback);
    }

    // DebugConsole表示用に、NS/EC/AGC の実行中トラック反映結果を通知する。
    setAudioConstraintRuntimeApplyCallback(
        callback: (report: AudioConstraintRuntimeApplyReport) => void,
    ): void {
        this.onAudioConstraintRuntimeApplyCallback = callback;
    }

    // VAD判定に連動して無音時の送信音量を0にするかを切り替える。
    setVadGateEnabled(enabled: boolean): void {
        this.audioProcessor.setVadGateEnabled(enabled);
    }

    // VADの閾値を更新し、処理中であればAudioWorkletへ即時反映する。
    setVadThresholds(config: Partial<VadThresholdConfig>): void {
        this.audioProcessor.setVadThresholds(config);
    }

    // VAD閾値の手動/自動/学習モードを切り替える。
    setVadThresholdMode(mode: VadThresholdMode): void {
        this.audioProcessor.setVadThresholdMode(mode);
    }

    getVadThresholdMode(): VadThresholdMode {
        return this.audioProcessor.getVadThresholdMode();
    }

    // 学習VADの推論パラメータ（ON/OFF閾値・hangover・推論間隔）を更新する。
    setLearnedVadTuning(config: Partial<LearnedVadTuningConfig>): void {
        this.audioProcessor.setLearnedVadTuning(config);
    }

    getLearnedVadTuning(): LearnedVadTuningConfig {
        return this.audioProcessor.getLearnedVadTuning();
    }

    setLearnedVadStrictMode(enabled: boolean): void {
        this.audioProcessor.setLearnedVadStrictMode(enabled);
    }

    getLearnedVadStrictMode(): boolean {
        return this.audioProcessor.getLearnedVadStrictMode();
    }

    // 学習VADのプリセットを適用する。
    setLearnedVadPerformanceMode(mode: LearnedVadPerformanceMode): void {
        this.audioProcessor.setLearnedVadPerformanceMode(mode);
    }

    // 騒音会場向けの強フィルタプロファイルを切り替える。
    setVenueNoiseModeEnabled(enabled: boolean): void {
        this.audioProcessor.setVenueNoiseModeEnabled(enabled);
    }

    // HPF/LPF設定を更新し、処理中であればフィルタへ即時反映する。
    setAudioFilterConfig(config: Partial<Omit<AudioFilterConfig, "vadThreshold">>): void {
        this.audioProcessor.setAudioFilterConfig(config);
    }

    getAudioFilterConfig(): Omit<AudioFilterConfig, "vadThreshold"> {
        return this.audioProcessor.getAudioFilterConfig();
    }

    getVadThresholds(): VadThresholdConfig {
        return this.audioProcessor.getVadThresholds();
    }

    // マイク/カメラを取得し、音声は必要に応じてVAD/フィルタ付きトラックへ差し替えて返す。
    getUserMedia(
        audioTrackCallback: (audioTrack: MediaStreamTrack) => void,
        videoTrackCallback: (videoTrack: MediaStreamTrack) => void,
        errCallback: (err: unknown) => void,
    ): void {
        navigator.mediaDevices
            .getUserMedia(this.config)
            .then(async (mediaStream) => {
                await installMediaStreamTracks({
                    mediaStream,
                    processAudioTrack: (track) =>
                        this.audioProcessor.buildProcessedAudioTrack(track),
                    onRawAudioTrack: (track) => {
                        this.rawAudioTrack = track;
                    },
                    onProcessedAudioTrack: (track) => {
                        this.audioTrack = track;
                        audioTrackCallback(track);
                    },
                    onVideoTrack: (track) => {
                        this.videoTrack = track;
                        videoTrackCallback(track);
                    },
                });
            })
            .catch((err) => {
                frontendLogger.error("Could not acquire media.", { error: err });
                errCallback(err);
            });
    }

    // 実行中のマイク入力を再取得し、処理済み送信用トラックへ差し替える。
    async reacquireAudioTrack(): Promise<MediaStreamTrack> {
        const previousProcessedTrack = this.audioTrack;
        const previousRawTrack = this.rawAudioTrack;
        const previousEnabled = previousProcessedTrack?.enabled ?? true;
        const nextRawTrack = await acquireRawAudioTrack(this.config);

        try {
            const nextProcessedTrack =
                await this.audioProcessor.buildProcessedAudioTrack(nextRawTrack);
            nextProcessedTrack.enabled = previousEnabled;
            this.rawAudioTrack = nextRawTrack;
            this.audioTrack = nextProcessedTrack;
            stopPreviousAudioTracks(previousRawTrack, previousProcessedTrack);
            return nextProcessedTrack;
        } catch (error) {
            nextRawTrack.stop();
            throw error;
        }
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

    // 顔認識機能未使用時などにカメラ取得を無効化する。
    disableVideo(): void {
        this.config.video = false;
    }

    // 取得したメディアトラックと音声処理リソースを停止する。
    close(): void {
        const audioTrack = this.audioTrack;
        const rawAudioTrack = this.rawAudioTrack;
        stopTrack(this.videoTrack);
        this.videoTrack = undefined;
        if (audioTrack) {
            audioTrack.stop();
            this.audioTrack = undefined;
        }
        if (rawAudioTrack && rawAudioTrack !== audioTrack) {
            rawAudioTrack.stop();
        }
        this.rawAudioTrack = undefined;
        this.audioProcessor.dispose();
    }

    // 音声制約の boolean パラメータ更新を共通化する。
    private updateAudioBooleanConstraint(key: AudioBooleanConstraintKey, enabled: boolean): void {
        if (!setAudioBooleanConstraintInConfig(this.config, key, enabled)) {
            return;
        }
        applyAudioBooleanConstraintToTrack({
            key,
            enabled,
            rawTrack: this.rawAudioTrack,
            onReport: (report) => {
                this.onAudioConstraintRuntimeApplyCallback(report);
            },
        });
    }
}
