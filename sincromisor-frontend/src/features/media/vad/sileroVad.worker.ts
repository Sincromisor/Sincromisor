import { InferenceSession } from "onnxruntime-web/wasm";
import { SileroVadInference } from "./sileroVadInference";
import { normalizePcmFrame, positiveNumberOrDefault } from "./sileroVadPcm";
import { SileroVadSpeechState } from "./sileroVadSpeechState";
import { SileroVadStream } from "./sileroVadStream";

type InitMessage = {
    type: "init";
    modelUrl?: string;
};

type SetEnabledMessage = {
    type: "set-enabled";
    enabled: boolean;
};

type SetParamsMessage = {
    type: "set-params";
    onThreshold?: number;
    offThreshold?: number;
    hangoverMs?: number;
    minReportIntervalMs?: number;
    onConsecutiveFrames?: number;
    offConsecutiveFrames?: number;
};

type AudioFrameMessage = {
    type: "audio-frame";
    pcm: Float32Array | ArrayBuffer | ArrayBufferView | number[];
    sampleRate: number;
};

type WorkerInputMessage = InitMessage | SetEnabledMessage | SetParamsMessage | AudioFrameMessage;

// Silero VAD 推論専用 Worker。
// メインスレッド/AudioWorklet から受けた PCM を ONNX Runtime で推論し、speech probability を返す。
let enabled = false;
let initialized = false;
let available = false;
let inference: SileroVadInference | undefined;
let busy = false;
let generation = 0;
const stream = new SileroVadStream();
let queuedFrames: Float32Array[] = [];
let inputSampleRate: number | undefined;
let audioTimeMs = 0;
let lastSpeech = false;
// 1秒を超える古い音声を判定し続けず、既存Workletの即時RMS判定へ退避する。
const MAX_QUEUED_FRAMES = Math.floor(1000 / 32);

const DEFAULT_MODEL_URL = "/3rd_party/silero-vad/silero_vad.onnx";

// 定期通知だけを間引く。発話状態の変化はゲート開閉へ即時反映する。
let minReportIntervalMs = 80;

let lastReportAtMs = 0;
const speechState = new SileroVadSpeechState();

// メインスレッドへWorker状態を通知する。
function postStatus(
    status: "idle" | "loading" | "ready" | "running" | "fallback" | "unavailable",
    message = "",
): void {
    self.postMessage({
        type: "status",
        status,
        message,
    });
}

// ONNX Runtimeセッションを初期化する。失敗時はfallbackモードへ遷移する。
async function initialize(config?: InitMessage): Promise<void> {
    if (initialized) {
        return;
    }
    initialized = true;
    const modelUrl = config?.modelUrl ?? DEFAULT_MODEL_URL;
    try {
        // Worker 内で ONNX Runtime を初期化し、メインスレッドの描画負荷と分離する。
        const session = await InferenceSession.create(modelUrl, {
            executionProviders: ["wasm"],
            graphOptimizationLevel: "all",
        });
        inference = new SileroVadInference(session);
        available = true;
        postStatus(enabled ? "running" : "ready", "Silero VAD model loaded");
    } catch (e) {
        available = false;
        postStatus("unavailable", `${e}`);
    }
}

// Workerメッセージ処理:
// - init / set-enabled / set-params は制御系
// - audio-frame は連続PCM。推論は直列化し、停止・代替処理時に系列全体をリセットする。
self.onmessage = async (event: MessageEvent<WorkerInputMessage>) => {
    const data = event.data;
    if (!data?.type) {
        return;
    }
    if (data.type === "init") {
        await initialize(data);
        return;
    }
    if (data.type === "set-enabled") {
        setWorkerEnabled(data.enabled);
        return;
    }
    if (data.type === "set-params") {
        updateWorkerParams(data);
        return;
    }
    if (data.type !== "audio-frame" || !enabled) {
        return;
    }
    await handleAudioFrame(data);
};

// 切替は処理中フレームも無効にする。busyは実行中のawaitが戻るまで維持する。
function resetStream(): void {
    generation += 1;
    inference?.reset();
    stream.reset();
    queuedFrames = [];
    inputSampleRate = undefined;
    speechState.reset();
    audioTimeMs = 0;
    lastReportAtMs = 0;
    lastSpeech = false;
}

function setWorkerEnabled(nextEnabled: boolean): void {
    enabled = nextEnabled;
    resetStream();
    available = inference !== undefined;
    postStatus(!enabled ? "idle" : available ? "running" : "loading");
}

function updateWorkerParams(data: SetParamsMessage): void {
    // 各パラメータはUI入力の異常値を受けても安全な範囲に丸める。
    speechState.setParams(data);
    if (typeof data.minReportIntervalMs === "number" && Number.isFinite(data.minReportIntervalMs)) {
        minReportIntervalMs = Math.max(20, Math.min(400, Math.round(data.minReportIntervalMs)));
    }
}

// 全サンプルを蓄積し、負荷上限に達した場合だけ系列を終了してRMSへ退避する。
async function handleAudioFrame(data: AudioFrameMessage): Promise<void> {
    if (!available || !inference) return;
    const pcm = normalizePcmFrame(data.pcm);
    const sampleRate = positiveNumberOrDefault(data.sampleRate, 48000);
    if (!pcm || pcm.length === 0) return;
    if (inputSampleRate !== undefined && inputSampleRate !== sampleRate) {
        resetStream();
        postStatus("running", "Audio sample rate changed; VAD state reset");
    }
    inputSampleRate = sampleRate;
    queuedFrames.push(...stream.push(pcm, sampleRate));
    if (queuedFrames.length > MAX_QUEUED_FRAMES) {
        fallbackToRms("Audio inference backlog exceeded one second");
        return;
    }
    if (busy) return;
    busy = true;
    try {
        await drainFrames();
    } finally {
        busy = false;
    }
}

// 推論の順序と状態を一か所で所有する。停止・レート変更・過負荷後の結果は配信しない。
async function drainFrames(): Promise<void> {
    while (enabled && available && inference && queuedFrames.length > 0) {
        const frame = queuedFrames.shift();
        if (!frame) return;
        const currentGeneration = generation;
        let probability: number | undefined;
        try {
            probability = await inference.infer(frame);
        } catch (error) {
            if (currentGeneration !== generation) continue;
            fallbackToRms(String(error));
            return;
        }
        if (currentGeneration !== generation || probability === undefined) continue;
        audioTimeMs += 32;
        const speech = speechState.update(probability, audioTimeMs);
        if (speech !== lastSpeech || audioTimeMs - lastReportAtMs >= minReportIntervalMs) {
            self.postMessage({ type: "vad-prob", probability, isSpeech: speech });
            lastReportAtMs = audioTimeMs;
        }
        lastSpeech = speech;
    }
}

// 学習確率をRMSから捏造せず、クライアントに学習判定の無効化を知らせる。
function fallbackToRms(message: string): void {
    available = false;
    resetStream();
    postStatus("fallback", message);
}
