import {
    AUTO_VAD_MIN_RMS_THRESHOLD,
    AUTO_VAD_NOISE_FLOOR_ALPHA,
    AUTO_VAD_UPDATE_INTERVAL_MS,
    clampVadThresholds,
    DEFAULT_FILTER_PROFILE,
    DEFAULT_VAD_RMS_THRESHOLD,
    LEARNED_VAD_TUNING_PRESETS,
    nextAutoRmsThreshold,
} from "../userMedia/userMediaAudioProfiles";
import type {
    LearnedVadPerformanceMode,
    LearnedVadStateReport,
    LearnedVadTuningConfig,
    VadStateReport,
    VadThresholdConfig,
    VadThresholdMode,
} from "../userMedia/userMediaTypes";
import { LearnedVadWorkerClient } from "./learnedVadWorkerClient";
import {
    normalizePcmFrame,
    positiveNumberOrDefault,
    type VadWorkletMessage,
    vadReportFromWorkletMessage,
} from "./userMediaVadWorklet";

// Worklet VAD と学習VADの状態遷移をまとめる。
// WebAudioノード配線は UserMediaAudioProcessor 側に残し、判定ポリシーだけをここで扱う。
export class UserMediaVadRuntime {
    private onVadStateCallback: (report: VadStateReport) => void = () => {};
    private onVadThresholdCallback: (config: VadThresholdConfig) => void = () => {};
    private onLearnedVadStateCallback: (report: LearnedVadStateReport) => void = () => {};
    private learnedVadClient: LearnedVadWorkerClient;
    private vadNode?: AudioWorkletNode;
    private vadThresholdMode: VadThresholdMode = "manual";
    private manualVadThresholdConfig: VadThresholdConfig = DEFAULT_FILTER_PROFILE.vadThreshold;
    private vadThresholdConfig: VadThresholdConfig = DEFAULT_FILTER_PROFILE.vadThreshold;
    private autoNoiseFloorRms = DEFAULT_VAD_RMS_THRESHOLD * 0.5;
    private autoLastThresholdApplyAtMs = 0;
    private learnedVadStreamRecoveryLastAtMs = 0;
    private learnedVadStrictMode = false;
    private diagnosticVadEnabled = false;

    constructor() {
        this.learnedVadClient = new LearnedVadWorkerClient((report: LearnedVadStateReport) => {
            this.onLearnedVadStateCallback(report);
        });
    }

    setVadStateCallback(callback: (report: VadStateReport) => void): void {
        this.onVadStateCallback = callback;
    }

    setVadThresholdCallback(callback: (config: VadThresholdConfig) => void): void {
        this.onVadThresholdCallback = callback;
    }

    setLearnedVadStateCallback(callback: (report: LearnedVadStateReport) => void): void {
        this.onLearnedVadStateCallback = callback;
        this.onLearnedVadStateCallback(this.learnedVadClient.getSnapshot());
    }

    setVadThresholds(config: Partial<VadThresholdConfig>): void {
        this.manualVadThresholdConfig = {
            rmsThreshold: clampManualRmsThreshold(
                config.rmsThreshold,
                this.manualVadThresholdConfig.rmsThreshold,
            ),
            peakThreshold: clampManualPeakThreshold(
                config.peakThreshold,
                this.manualVadThresholdConfig.peakThreshold,
            ),
        };
        if (this.vadThresholdMode === "manual") {
            this.applyVadThresholds(this.manualVadThresholdConfig);
        }
    }

    /** 方式の保存値を保ち、通常会話への切替時は学習WorkerとPCM転送を終了する。 */
    setDiagnosticVadEnabled(enabled: boolean): void {
        this.diagnosticVadEnabled = enabled;
        this.setLearnedVadEnabled(enabled && this.vadThresholdMode === "learned");
    }

    /** 診断方式を保持する。通常会話中のlearned選択は設定だけを更新し、推論を開始しない。 */
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
            AUTO_VAD_MIN_RMS_THRESHOLD * 0.5,
            this.vadThresholdConfig.rmsThreshold * 0.5,
        );
        this.autoLastThresholdApplyAtMs = 0;
        this.applyVadThresholds({
            rmsThreshold: nextAutoRmsThreshold(this.autoNoiseFloorRms),
            peakThreshold: this.manualVadThresholdConfig.peakThreshold,
        });
    }

    getVadThresholdMode(): VadThresholdMode {
        return this.vadThresholdMode;
    }

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

    setLearnedVadPerformanceMode(mode: LearnedVadPerformanceMode): void {
        const preset = LEARNED_VAD_TUNING_PRESETS[mode];
        if (!preset) {
            return;
        }
        this.learnedVadClient.setTuningConfig(preset);
    }

    /** 自動追従中の計測閾値と区別し、利用者が選んだ手動閾値を保存用に返す。 */
    getManualVadThresholds(): VadThresholdConfig {
        return { ...this.manualVadThresholdConfig };
    }

    getVadThresholds(): VadThresholdConfig {
        return { ...this.vadThresholdConfig };
    }

    attachVadNode(vadNode: AudioWorkletNode): void {
        this.vadNode = vadNode;
        this.postVadThresholds();
        // dispose後の再接続でも、診断モードに限り保存された学習方式を再開する。
        this.setLearnedVadEnabled(this.diagnosticVadEnabled && this.vadThresholdMode === "learned");
    }

    clearVadNode(): void {
        this.vadNode = undefined;
        this.learnedVadStreamRecoveryLastAtMs = 0;
    }

    handleWorkletMessage(data: VadWorkletMessage | undefined): VadStateReport | undefined {
        if (!data) {
            return undefined;
        }
        if (data.type === "audio-frame" || data.pcm !== undefined) {
            this.forwardPcmFrameToLearnedVad(data);
            return undefined;
        }
        if (data.type !== "vad") {
            return undefined;
        }
        const fallbackVadReport = vadReportFromWorkletMessage(data);
        this.updateAutoVadThreshold(fallbackVadReport);
        this.recoverLearnedVadStreamIfNeeded();
        const report = {
            isSpeech: this.resolveSpeechState(fallbackVadReport),
            rms: fallbackVadReport.rms,
            peak: fallbackVadReport.peak,
        };
        this.onVadStateCallback(report);
        return report;
    }

    dispose(): void {
        this.clearVadNode();
        this.learnedVadClient.dispose();
    }

    private forwardPcmFrameToLearnedVad(data: VadWorkletMessage): void {
        const pcm = normalizePcmFrame(data.pcm);
        const sampleRate = positiveNumberOrDefault(data.sampleRate, 48000);
        if (pcm !== undefined && pcm.length > 0) {
            this.learnedVadClient.postAudioFrame(pcm, sampleRate);
        }
    }

    private recoverLearnedVadStreamIfNeeded(): void {
        if (
            !this.diagnosticVadEnabled ||
            this.vadThresholdMode !== "learned" ||
            this.learnedVadClient.hasValidPrediction()
        ) {
            return;
        }
        const now = performance.now();
        if (now - this.learnedVadStreamRecoveryLastAtMs < 1000) {
            return;
        }
        this.learnedVadClient.syncAudioFrameStreaming(this.vadNode, true, true);
        this.learnedVadStreamRecoveryLastAtMs = now;
    }

    private resolveSpeechState(fallbackVadReport: VadStateReport): boolean {
        if (!this.diagnosticVadEnabled || this.vadThresholdMode !== "learned") {
            return fallbackVadReport.isSpeech;
        }
        if (!this.learnedVadClient.hasValidPrediction()) {
            return fallbackVadReport.isSpeech;
        }
        if (this.learnedVadStrictMode) {
            return this.learnedVadClient.getSpeechState() && fallbackVadReport.isSpeech;
        }
        return this.learnedVadClient.getSpeechState();
    }

    /** 診断の許可と保存方式を実行状態へ反映し、不要なPCM転送も止める。 */
    private setLearnedVadEnabled(enabled: boolean): void {
        this.learnedVadClient.setEnabled(enabled && this.diagnosticVadEnabled);
        this.syncLearnedVadStreamState();
    }

    /** WorkerとWorkletのPCM転送を同じ診断許可に揃え、再接続でも通常会話へ推論を持ち込まない。 */
    private syncLearnedVadStreamState(): void {
        const shouldEnable = this.diagnosticVadEnabled && this.vadThresholdMode === "learned";
        this.learnedVadClient.syncAudioFrameStreaming(this.vadNode, shouldEnable);
        if (!shouldEnable) {
            this.learnedVadStreamRecoveryLastAtMs = 0;
        }
    }

    private applyVadThresholds(config: VadThresholdConfig): void {
        this.vadThresholdConfig = clampVadThresholds(config);
        this.postVadThresholds();
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
        this.onVadThresholdCallback({ ...this.vadThresholdConfig });
    }

    private updateAutoVadThreshold(report: { isSpeech: boolean; rms: number }): void {
        if (!this.diagnosticVadEnabled || this.vadThresholdMode !== "auto") {
            return;
        }
        if (!report.isSpeech) {
            const nextFloor =
                this.autoNoiseFloorRms * (1 - AUTO_VAD_NOISE_FLOOR_ALPHA) +
                report.rms * AUTO_VAD_NOISE_FLOOR_ALPHA;
            this.autoNoiseFloorRms = Math.max(0, Math.min(1, nextFloor));
        }

        const now = performance.now();
        if (now - this.autoLastThresholdApplyAtMs < AUTO_VAD_UPDATE_INTERVAL_MS) {
            return;
        }
        const nextRmsThreshold = nextAutoRmsThreshold(this.autoNoiseFloorRms);
        if (Math.abs(nextRmsThreshold - this.vadThresholdConfig.rmsThreshold) < 0.001) {
            return;
        }
        this.autoLastThresholdApplyAtMs = now;
        this.applyVadThresholds({
            rmsThreshold: nextRmsThreshold,
            peakThreshold: this.manualVadThresholdConfig.peakThreshold,
        });
    }
}

function clampManualRmsThreshold(value: number | undefined, fallback: number): number {
    if (value === undefined || !Number.isFinite(value)) {
        return fallback;
    }
    return Math.max(0.001, Math.min(0.2, value));
}

function clampManualPeakThreshold(value: number | undefined, fallback: number): number {
    if (value === undefined || !Number.isFinite(value)) {
        return fallback;
    }
    return Math.max(0.01, Math.min(0.99, value));
}
