import { InferenceSession } from "onnxruntime-web/wasm";
import { SileroVadInference } from "./sileroVadInference";
import { linearResample, normalizePcmFrame, positiveNumberOrDefault, rmsOf } from "./sileroVadPcm";
import { SileroVadSpeechState } from "./sileroVadSpeechState";

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
    minInferIntervalMs?: number;
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
let pendingFrame: { pcm: Float32Array; sampleRate: number } | undefined;

const DEFAULT_MODEL_URL = "/3rd_party/silero-vad/silero_vad.onnx";

// 推論間引き間隔(ms)。描画負荷とのトレードオフ調整に使う。
let minInferIntervalMs = 80;

let lastInferAtMs = 0;
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

// 音声を16kHzへ変換する。連続フレームへの蓄積は後続の音声処理で扱う。
async function inferProbability(
    pcm: Float32Array,
    sampleRate: number,
): Promise<number | undefined> {
    if (!available || !inference) return undefined;
    const pcm16k = linearResample(pcm, sampleRate, 16000);
    const frame = new Float32Array(512);
    frame.set(pcm16k.subarray(Math.max(0, pcm16k.length - 512)), Math.max(0, 512 - pcm16k.length));
    return inference.infer(frame);
}

// Workerメッセージ処理:
// - init / set-enabled / set-params は制御系
// - audio-frame は推論系（最新フレームのみ保持して負荷上昇を抑制）
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

function setWorkerEnabled(nextEnabled: boolean): void {
    generation += 1;
    enabled = !!nextEnabled;
    inference?.reset();
    pendingFrame = undefined;
    speechState.reset();
    lastInferAtMs = 0;
    postStatus(enabled ? "running" : "idle");
}

function updateWorkerParams(data: SetParamsMessage): void {
    // 各パラメータはUI入力の異常値を受けても安全な範囲に丸める。
    speechState.setParams(data);
    if (typeof data.minInferIntervalMs === "number" && Number.isFinite(data.minInferIntervalMs)) {
        minInferIntervalMs = Math.max(20, Math.min(400, Math.round(data.minInferIntervalMs)));
    }
}

async function handleAudioFrame(data: AudioFrameMessage): Promise<void> {
    const pcm = normalizePcmFrame(data.pcm);
    const sampleRate = positiveNumberOrDefault(data.sampleRate, 48000);
    if (!pcm || pcm.length === 0) {
        return;
    }

    // 推論が詰まってもキューを増やさず最新フレームだけ保持し、描画・音声処理への波及を抑える。
    pendingFrame = { pcm, sampleRate };
    if (busy) {
        // 推論キューが増え続けると描画負荷へ波及するため、常に最新フレームのみ保持する。
        return;
    }
    busy = true;
    while (pendingFrame) {
        const current = pendingFrame;
        pendingFrame = undefined;
        const now = Date.now();
        if (now - lastInferAtMs < minInferIntervalMs) {
            continue;
        }
        lastInferAtMs = now;

        const currentGeneration = generation;
        let probability: number | undefined;
        try {
            probability = await inferProbability(current.pcm, current.sampleRate);
        } catch (e) {
            if (currentGeneration !== generation) continue;
            available = false;
            postStatus("fallback", `${e}`);
        }

        // 停止・再開を跨いだ出力は、代替判定も含めて新しいセッションへ渡さない。
        if (currentGeneration !== generation || !enabled) continue;
        if (probability === undefined) {
            const rms = rmsOf(current.pcm);
            probability = Math.max(0, Math.min(1, (rms - 0.01) * 18));
        }
        const speech = speechState.update(probability);
        self.postMessage({
            type: "vad-prob",
            probability,
            isSpeech: speech,
        });
    }
    busy = false;
}
