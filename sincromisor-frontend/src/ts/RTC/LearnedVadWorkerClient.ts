export type LearnedVadStatus =
    | "idle"
    | "loading"
    | "ready"
    | "running"
    | "fallback"
    | "unavailable";

export type LearnedVadStateReport = {
    enabled: boolean;
    status: LearnedVadStatus;
    probability?: number;
    isSpeech: boolean;
    txFrames?: number;
    rxPredictions?: number;
    message?: string;
};

type LearnedVadWorkerMessage =
    | { type: "status"; status?: LearnedVadStatus; message?: string }
    | { type: "vad-prob"; probability?: number; isSpeech?: boolean };

export type LearnedVadTuningConfig = {
    // Speechへ遷移する確率閾値。上げるほど誤反応は減るが取りこぼしは増える。
    onThreshold: number;
    // Silenceへ戻す確率閾値。通常は onThreshold より小さくしてヒステリシスを作る。
    offThreshold: number;
    // 一度Speechになった後、OFF条件を満たしても保持する時間(ms)。
    hangoverMs: number;
    // 推論実行間隔(ms)。小さいほど応答性は上がるがCPU負荷も上がる。
    minInferIntervalMs: number;
    // ON閾値を連続で超える必要フレーム数。誤反応抑制に効く。
    onConsecutiveFrames: number;
    // OFF閾値を連続で下回る必要フレーム数。状態の揺れ抑制に効く。
    offConsecutiveFrames: number;
};

// バランス重視の既定値。会場騒音環境ではプリセットやUIから再調整する想定。
const DEFAULT_TUNING: LearnedVadTuningConfig = {
    onThreshold: 0.0008,
    offThreshold: 0.0004,
    hangoverMs: 180,
    minInferIntervalMs: 80,
    onConsecutiveFrames: 2,
    offConsecutiveFrames: 2,
};

// Worker側の学習VAD推論を管理するクライアント。
// UserMediaManagerからは「有効化」「音声フレーム転送」「現在状態参照」のみ扱えるように責務を限定する。
export class LearnedVadWorkerClient {
    private worker?: Worker;
    private status: LearnedVadStatus = "idle";
    private probability: number | undefined = undefined;
    private isSpeech: boolean = false;
    private enabled: boolean = false;
    private streamEnabled: boolean = false;
    private streamVadNode?: AudioWorkletNode;
    private hasPrediction: boolean = false;
    private txFrames: number = 0;
    private rxPredictions: number = 0;
    private tuning: LearnedVadTuningConfig = { ...DEFAULT_TUNING };
    private readonly onStateChanged: (report: LearnedVadStateReport) => void;

    constructor(onStateChanged: (report: LearnedVadStateReport) => void) {
        this.onStateChanged = onStateChanged;
    }

    // 推論Workerを遅延生成する。未使用時に余分なCPU/メモリを使わないための初期化ポイント。
    // UserMediaManager からは必要時にだけ呼ばれ、通常モードでは Worker を起動しない。
    ensureWorker(): void {
        if (this.worker) {
            return;
        }
        this.status = "loading";
        this.publishState();
        const worker = new Worker(new URL("./silero-vad.worker.ts", import.meta.url), {
            type: "module",
        });
        this.worker = worker;
        worker.onmessage = (event: MessageEvent<LearnedVadWorkerMessage>) => {
            const data = event.data;
            if (!data?.type) {
                return;
            }
            if (data.type === "status") {
                // Worker起動/モデル読込/フォールバック状態を UI 表示へそのまま伝える。
                if (data.status) {
                    this.status = data.status;
                }
                this.publishState(data.message);
                return;
            }
            if (data.type !== "vad-prob") {
                return;
            }
            // 推論結果は Worker 側で1フレーム単位に更新されるため、ここでは UI 表示用に正規化して保持する。
            const p = Number(data.probability);
            this.probability = Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : undefined;
            this.isSpeech = !!data.isSpeech;
            this.hasPrediction = this.probability !== undefined;
            this.rxPredictions += 1;
            this.publishState();
        };
        worker.onerror = (event: ErrorEvent) => {
            this.status = "fallback";
            this.publishState(`${event.message}`);
        };
        worker.postMessage({ type: "init" });
        this.postTuningConfig();
    }

    // 学習VAD有効化を切り替える。ON/OFF時に推論状態はリセットして誤判定を持ち越さない。
    setEnabled(enabled: boolean): void {
        this.ensureWorker();
        this.enabled = enabled;
        this.probability = undefined;
        this.isSpeech = false;
        this.hasPrediction = false;
        this.txFrames = 0;
        this.rxPredictions = 0;
        this.worker?.postMessage({
            type: "set-enabled",
            enabled,
        });
        this.publishState();
    }

    // UIから渡されたチューニング値を検証・補正してWorkerへ反映する。
    setTuningConfig(config: Partial<LearnedVadTuningConfig>): void {
        this.tuning = {
            // 閾値レンジは Silero実測レンジ(小数点第4位付近)に合わせている。
            onThreshold:
                config.onThreshold !== undefined
                    ? Math.max(0.0001, Math.min(0.1, config.onThreshold))
                    : this.tuning.onThreshold,
            offThreshold:
                config.offThreshold !== undefined
                    ? Math.max(0.00005, Math.min(0.08, config.offThreshold))
                    : this.tuning.offThreshold,
            hangoverMs:
                config.hangoverMs !== undefined
                    ? Math.max(0, Math.min(1200, Math.round(config.hangoverMs)))
                    : this.tuning.hangoverMs,
            minInferIntervalMs:
                config.minInferIntervalMs !== undefined
                    ? Math.max(20, Math.min(400, Math.round(config.minInferIntervalMs)))
                    : this.tuning.minInferIntervalMs,
            onConsecutiveFrames:
                config.onConsecutiveFrames !== undefined
                    ? Math.max(1, Math.min(10, Math.round(config.onConsecutiveFrames)))
                    : this.tuning.onConsecutiveFrames,
            offConsecutiveFrames:
                config.offConsecutiveFrames !== undefined
                    ? Math.max(1, Math.min(10, Math.round(config.offConsecutiveFrames)))
                    : this.tuning.offConsecutiveFrames,
        };
        // on/offの関係が崩れないように補正する。
        if (this.tuning.offThreshold >= this.tuning.onThreshold) {
            this.tuning.offThreshold = Math.max(0.00005, this.tuning.onThreshold * 0.7);
        }
        this.postTuningConfig();
    }

    // 外部UI同期用に現在のチューニング値を返す。
    getTuningConfig(): LearnedVadTuningConfig {
        return { ...this.tuning };
    }

    // DebugConsole表示用の現在スナップショットを返す。
    getSnapshot(): LearnedVadStateReport {
        return {
            enabled: this.enabled,
            status: this.status,
            probability: this.probability,
            isSpeech: this.isSpeech,
            txFrames: this.txFrames,
            rxPredictions: this.rxPredictions,
        };
    }

    // AudioWorklet -> Worker の音声フレーム転送を有効/無効化する。
    // learnedモード時のみ転送し、Three.js描画と競合する余計な転送コストを抑える。
    syncAudioFrameStreaming(
        vadNode: AudioWorkletNode | undefined,
        shouldEnable: boolean,
        force = false,
    ): void {
        if (vadNode === undefined) {
            this.streamVadNode = undefined;
            return;
        }
        const nodeChanged = this.streamVadNode !== vadNode;
        if (!force && !nodeChanged && this.streamEnabled === shouldEnable) {
            return;
        }
        // AudioWorklet 側に「学習VAD向けPCM転送のON/OFF」だけを通知し、
        // 実際の推論ロジックや閾値状態は Worker 側へ閉じ込める。
        vadNode.port.postMessage({
            type: "learned-vad-stream",
            enabled: shouldEnable,
        });
        this.streamVadNode = vadNode;
        this.streamEnabled = shouldEnable;
    }

    // AudioWorkletから受けたPCMフレームをTransferableでWorkerへ渡す。
    postAudioFrame(pcm: Float32Array, sampleRate: number): void {
        if (!this.enabled) {
            return;
        }
        this.worker?.postMessage(
            {
                type: "audio-frame",
                pcm,
                sampleRate,
            },
            [pcm.buffer],
        );
        this.txFrames += 1;
    }

    // learnedモード時の最終スピーチ判定を返す。
    getSpeechState(): boolean {
        return this.isSpeech;
    }

    hasValidPrediction(): boolean {
        return this.hasPrediction;
    }

    // セッション終了時にWorkerを破棄し、次回開始をクリーンな状態に戻す。
    dispose(): void {
        if (this.worker) {
            this.worker.terminate();
        }
        this.worker = undefined;
        this.status = "idle";
        this.probability = undefined;
        this.isSpeech = false;
        this.enabled = false;
        this.streamEnabled = false;
        this.streamVadNode = undefined;
        this.hasPrediction = false;
        this.txFrames = 0;
        this.rxPredictions = 0;
    }

    // UI層へ現在状態を通知する単一経路。
    // 状態更新経路を一箇所にまとめ、DebugConsole/React 表示の取りこぼしを防ぐ。
    private publishState(message?: string): void {
        this.onStateChanged({
            enabled: this.enabled,
            status: this.status,
            probability: this.probability,
            isSpeech: this.isSpeech,
            txFrames: this.txFrames,
            rxPredictions: this.rxPredictions,
            message,
        });
    }

    // Worker側推論パラメータを一括送信する。
    // しきい値・hangover・間引き設定は Worker 側で最終判定に使われる。
    private postTuningConfig(): void {
        this.worker?.postMessage({
            type: "set-params",
            onThreshold: this.tuning.onThreshold,
            offThreshold: this.tuning.offThreshold,
            hangoverMs: this.tuning.hangoverMs,
            minInferIntervalMs: this.tuning.minInferIntervalMs,
            onConsecutiveFrames: this.tuning.onConsecutiveFrames,
            offConsecutiveFrames: this.tuning.offConsecutiveFrames,
        });
    }
}
