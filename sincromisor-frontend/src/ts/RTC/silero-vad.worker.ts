import * as ort from "onnxruntime-web";
import {
    linearResample,
    normalizePcmFrame,
    normalizeWindow,
    positiveNumberOrDefault,
    rmsOf,
} from "./sileroVadPcm";
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
let session: ort.InferenceSession | undefined;
let modelStateTensor: ort.Tensor | undefined;
let busy = false;
let pendingFrame: { pcm: Float32Array; sampleRate: number } | undefined;

const DEFAULT_MODEL_URL = "/3rd_party/silero-vad/silero_vad.onnx";

// 推論間引き間隔(ms)。描画負荷とのトレードオフ調整に使う。
let minInferIntervalMs = 80;

let lastInferAtMs = 0;
const speechState = new SileroVadSpeechState();

type OnnxDim = number | string | bigint | null;

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

// ONNXメタデータの可変次元を実テンソル作成用の安全な数値配列へ解決する。
function resolveDims(dims: ReadonlyArray<OnnxDim> | undefined, fallback: number[]): number[] {
    const source = dims && dims.length > 0 ? dims : fallback;
    return source.map((d: OnnxDim) => (typeof d === "number" && d > 0 ? d : 1));
}

// 次元配列からバッファサイズを計算する。
function tensorSize(dims: ReadonlyArray<number>): number {
    return dims.reduce((a: number, b: number) => a * b, 1);
}

// `inputNames` と同順で返る `inputMetadata` から対象入力の次元情報を取り出す。
function getInputDims(
    currentSession: ort.InferenceSession,
    inputName: string,
): ReadonlyArray<OnnxDim> | undefined {
    const inputIndex = currentSession.inputNames.indexOf(inputName);
    if (inputIndex < 0 || inputIndex >= currentSession.inputMetadata.length) {
        return undefined;
    }
    const metadata = currentSession.inputMetadata[inputIndex] as unknown;
    if (!metadata || typeof metadata !== "object" || !("dimensions" in metadata)) {
        return undefined;
    }
    const dimensions = (metadata as { dimensions?: ReadonlyArray<OnnxDim> }).dimensions;
    return dimensions;
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
        session = await ort.InferenceSession.create(modelUrl, {
            executionProviders: ["wasm"],
            graphOptimizationLevel: "all",
        });
        available = true;
        postStatus(enabled ? "running" : "ready", "Silero VAD model loaded");
    } catch (e) {
        available = false;
        postStatus("unavailable", `${e}`);
    }
}

// 1フレーム分の音声から speech probability を推論する。
// できるだけモデル差異に強くするため、入力/出力名は文字列パターンで解決する。
async function inferProbability(
    pcm: Float32Array,
    sampleRate: number,
): Promise<number | undefined> {
    if (!available || session === undefined) {
        return undefined;
    }
    const pcm16k = linearResample(pcm, sampleRate, 16000);
    const frame = normalizeWindow(pcm16k, 512);
    const result = await session.run(buildInferenceFeeds(frame));
    return readInferenceProbability(result);
}

function buildInferenceFeeds(frame: Float32Array): Record<string, ort.Tensor> {
    const feeds: Record<string, ort.Tensor> = {};
    if (!session) {
        return feeds;
    }
    // モデル差分に耐えるため、input/output 名を厳密固定せずパターンで解決する。
    for (const inputName of session.inputNames) {
        const lower = `${inputName}`.toLowerCase();
        if (lower.includes("input")) {
            feeds[inputName] = new ort.Tensor("float32", frame, [1, frame.length]);
            continue;
        }
        if (lower.includes("sr")) {
            feeds[inputName] = new ort.Tensor("int64", new BigInt64Array([16000n]), [1]);
            continue;
        }
        if (lower.includes("state")) {
            if (!modelStateTensor) {
                const dims = getInputDims(session, inputName);
                const resolvedDims = resolveDims(dims, [2, 1, 128]);
                const stateSize = tensorSize(resolvedDims);
                modelStateTensor = new ort.Tensor(
                    "float32",
                    new Float32Array(stateSize),
                    resolvedDims,
                );
            }
            feeds[inputName] = modelStateTensor;
            continue;
        }
        const dims = getInputDims(session, inputName);
        if (!dims || dims.length === 0) {
            continue;
        }
        const resolvedDims = resolveDims(dims, [1]);
        const size = tensorSize(resolvedDims);
        feeds[inputName] = new ort.Tensor("float32", new Float32Array(size), resolvedDims);
    }
    return feeds;
}

function readInferenceProbability(result: Record<string, ort.Tensor>): number | undefined {
    if (!session) {
        return undefined;
    }
    let probability: number | undefined;
    for (const outputName of session.outputNames) {
        const output = result[outputName];
        if (!output?.data || output.data.length === 0) {
            continue;
        }
        const lower = `${outputName}`.toLowerCase();
        if (lower.includes("state")) {
            modelStateTensor = output;
            continue;
        }
        const p = Number(output.data[0]);
        if (Number.isFinite(p)) {
            probability = Math.max(0, Math.min(1, p));
            break;
        }
    }
    return probability;
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
    enabled = !!nextEnabled;
    if (!enabled) {
        pendingFrame = undefined;
        busy = false;
        speechState.reset();
    }
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

        let probability: number | undefined;
        try {
            probability = await inferProbability(current.pcm, current.sampleRate);
        } catch (e) {
            available = false;
            postStatus("fallback", `${e}`);
        }

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
