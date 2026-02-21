import * as ort from "onnxruntime-web";

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

let enabled = false;
let initialized = false;
let available = false;
let session: ort.InferenceSession | null = null;
let modelStateTensor: ort.Tensor | null = null;
let busy = false;
let pendingFrame: { pcm: Float32Array; sampleRate: number } | null = null;

const DEFAULT_MODEL_URL = "/3rd_party/silero-vad/silero_vad.onnx";

// 確率がこの値を超えるとSpeech候補。
let modeOnThreshold = 0.0008;
// 確率がこの値を下回るとSilence候補。
let modeOffThreshold = 0.0004;
// 一度Speechに入った後、OFF判定まで保持する猶予(ms)。
let hangoverMs = 180;
// 推論間引き間隔(ms)。描画負荷とのトレードオフ調整に使う。
let minInferIntervalMs = 80;
// ON/OFF切替時の連続条件（瞬間ノイズでの誤反応を抑える）。
let onConsecutiveFrames = 2;
let offConsecutiveFrames = 2;

let isSpeech = false;
let lastSpeechAtMs = 0;
let lastInferAtMs = 0;
let onConsecutiveCount = 0;
let offConsecutiveCount = 0;

type OnnxDim = number | string | bigint | null;

// メインスレッドへWorker状態を通知する。
function postStatus(status: "idle" | "loading" | "ready" | "running" | "fallback" | "unavailable", message = ""): void {
    self.postMessage({
        type: "status",
        status,
        message,
    });
}

// ONNX推論失敗時のフォールバック判定にも使う簡易RMS計算。
function rmsOf(pcm: Float32Array): number {
    let s = 0;
    for (let i = 0; i < pcm.length; i += 1) {
        const v = pcm[i];
        s += v * v;
    }
    return Math.sqrt(s / Math.max(1, pcm.length));
}

// Sileroの16kHz入力へ合わせるための軽量リサンプリング。
function linearResample(input: Float32Array, srcRate: number, dstRate: number): Float32Array {
    if (srcRate === dstRate) {
        return input;
    }
    const ratio = srcRate / dstRate;
    const outLength = Math.max(1, Math.floor(input.length / ratio));
    const out = new Float32Array(outLength);
    for (let i = 0; i < outLength; i += 1) {
        const x = i * ratio;
        const i0 = Math.floor(x);
        const i1 = Math.min(input.length - 1, i0 + 1);
        const t = x - i0;
        out[i] = input[i0] * (1 - t) + input[i1] * t;
    }
    return out;
}

// モデル入力長を固定する。長い場合は末尾を使い、短い場合は先頭側を0埋めする。
function normalizeWindow(input: Float32Array, targetSize: number): Float32Array {
    if (input.length === targetSize) {
        return input;
    }
    if (input.length > targetSize) {
        return input.subarray(input.length - targetSize);
    }
    const out = new Float32Array(targetSize);
    out.set(input, targetSize - input.length);
    return out;
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
function getInputDims(currentSession: ort.InferenceSession, inputName: string): ReadonlyArray<OnnxDim> | undefined {
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
    const modelUrl = config?.modelUrl || DEFAULT_MODEL_URL;
    try {
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
async function inferProbability(pcm: Float32Array, sampleRate: number): Promise<number | null> {
    if (!available || !session) {
        return null;
    }
    const pcm16k = linearResample(pcm, sampleRate, 16000);
    const frame = normalizeWindow(pcm16k, 512);
    const feeds: Record<string, ort.Tensor> = {};

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
                modelStateTensor = new ort.Tensor("float32", new Float32Array(stateSize), resolvedDims);
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

    const result = await session.run(feeds);
    let probability: number | null = null;
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

function normalizePcmFrame(raw: AudioFrameMessage["pcm"]): Float32Array | null {
    if (raw instanceof Float32Array) {
        return raw;
    }
    if (raw instanceof ArrayBuffer) {
        return new Float32Array(raw);
    }
    if (ArrayBuffer.isView(raw)) {
        return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
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

// ON/OFF閾値 + 連続フレーム条件 + hangover で最終スピーチ状態を決定する。
function updateSpeechState(probability: number): boolean {
    const now = Date.now();
    if (probability >= modeOnThreshold) {
        onConsecutiveCount += 1;
        offConsecutiveCount = 0;
        if (onConsecutiveCount >= onConsecutiveFrames) {
            isSpeech = true;
            lastSpeechAtMs = now;
            return true;
        }
        return isSpeech;
    }
    onConsecutiveCount = 0;
    if (probability < modeOffThreshold) {
        offConsecutiveCount += 1;
    } else {
        offConsecutiveCount = 0;
    }
    if (
        offConsecutiveCount >= offConsecutiveFrames
        && probability < modeOffThreshold
        && now - lastSpeechAtMs > hangoverMs
    ) {
        isSpeech = false;
        offConsecutiveCount = 0;
    }
    return isSpeech;
}

// Workerメッセージ処理:
// - init / set-enabled / set-params は制御系
// - audio-frame は推論系（最新フレームのみ保持して負荷上昇を抑制）
self.onmessage = async (event: MessageEvent<WorkerInputMessage>) => {
    const data = event.data;
    if (!data || !data.type) {
        return;
    }
    if (data.type === "init") {
        await initialize(data);
        return;
    }
    if (data.type === "set-enabled") {
        enabled = !!data.enabled;
        if (!enabled) {
            pendingFrame = null;
            busy = false;
            onConsecutiveCount = 0;
            offConsecutiveCount = 0;
            isSpeech = false;
        }
        postStatus(enabled ? "running" : "idle");
        return;
    }
    if (data.type === "set-params") {
        // 各パラメータはUI入力の異常値を受けても安全な範囲に丸める。
        if (typeof data.onThreshold === "number" && Number.isFinite(data.onThreshold)) {
            modeOnThreshold = Math.max(0.0001, Math.min(0.1, data.onThreshold));
        }
        if (typeof data.offThreshold === "number" && Number.isFinite(data.offThreshold)) {
            modeOffThreshold = Math.max(0.00005, Math.min(modeOnThreshold * 0.95, data.offThreshold));
        }
        if (typeof data.hangoverMs === "number" && Number.isFinite(data.hangoverMs)) {
            hangoverMs = Math.max(0, Math.min(1200, Math.round(data.hangoverMs)));
        }
        if (typeof data.minInferIntervalMs === "number" && Number.isFinite(data.minInferIntervalMs)) {
            minInferIntervalMs = Math.max(20, Math.min(400, Math.round(data.minInferIntervalMs)));
        }
        if (typeof data.onConsecutiveFrames === "number" && Number.isFinite(data.onConsecutiveFrames)) {
            onConsecutiveFrames = Math.max(1, Math.min(10, Math.round(data.onConsecutiveFrames)));
        }
        if (typeof data.offConsecutiveFrames === "number" && Number.isFinite(data.offConsecutiveFrames)) {
            offConsecutiveFrames = Math.max(1, Math.min(10, Math.round(data.offConsecutiveFrames)));
        }
        return;
    }
    if (data.type !== "audio-frame" || !enabled) {
        return;
    }
    const pcm = normalizePcmFrame(data.pcm);
    const sampleRate = Number(data.sampleRate) || 48000;
    if (!pcm || pcm.length === 0) {
        return;
    }

    pendingFrame = { pcm, sampleRate };
    if (busy) {
        // 推論キューが増え続けると描画負荷へ波及するため、常に最新フレームのみ保持する。
        return;
    }
    busy = true;
    while (pendingFrame) {
        const current = pendingFrame;
        pendingFrame = null;
        const now = Date.now();
        if (now - lastInferAtMs < minInferIntervalMs) {
            continue;
        }
        lastInferAtMs = now;

        let probability: number | null = null;
        try {
            probability = await inferProbability(current.pcm, current.sampleRate);
        } catch (e) {
            available = false;
            postStatus("fallback", `${e}`);
        }

        if (probability == null) {
            const rms = rmsOf(current.pcm);
            probability = Math.max(0, Math.min(1, (rms - 0.01) * 18));
        }
        const speech = updateSpeechState(probability);
        self.postMessage({
            type: "vad-prob",
            probability,
            isSpeech: speech,
        });
    }
    busy = false;
};
