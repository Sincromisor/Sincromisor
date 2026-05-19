import type { NormalizedLandmark, PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import { PoseLandmarker } from "@mediapipe/tasks-vision";
import type {
    PoseLandmarkerSpikeConfig,
    PoseLandmarkerSpikeMetrics,
    PoseLandmarkerSpikeModelPreset,
} from "../ts/characterGaze/poseLandmarkerSpike";
import {
    DEFAULT_POSE_LANDMARKER_SPIKE_CONFIG,
    POSE_LANDMARKER_SPIKE_MODEL_PATHS,
    PoseLandmarkerSpike,
} from "../ts/characterGaze/poseLandmarkerSpike";
import "./styles.css";

const previewVideo = requireElement("previewVideo", HTMLVideoElement);
const overlayCanvas = requireElement("overlayCanvas", HTMLCanvasElement);
const modelPresetInput = requireElement("modelPreset", HTMLSelectElement);
const modelPathInput = requireElement("modelPath", HTMLInputElement);
const targetFpsInput = requireElement("targetFps", HTMLSelectElement);
const delegateInput = requireElement("delegate", HTMLSelectElement);
const runFaceLandmarkerInput = requireElement("runFaceLandmarker", HTMLInputElement);
const startButton = requireElement("startButton", HTMLButtonElement);
const stopButton = requireElement("stopButton", HTMLButtonElement);
const markButton = requireElement("markButton", HTMLButtonElement);
const statusText = requireElement("statusText", HTMLParagraphElement);
const poseMs = requireElement("poseMs", HTMLElement);
const poseAvgMax = requireElement("poseAvgMax", HTMLElement);
const renderFps = requireElement("renderFps", HTMLElement);
const faceMs = requireElement("faceMs", HTMLElement);
const droppedFrames = requireElement("droppedFrames", HTMLElement);
const uiLatency = requireElement("uiLatency", HTMLElement);
const landmarkSummary = requireElement("landmarkSummary", HTMLPreElement);
const overlayContext = overlayCanvas.getContext("2d");

let lastMarkStartedAtMs: number | undefined;

const spike = new PoseLandmarkerSpike(previewVideo, {
    onMetrics: renderMetrics,
    onPoseResult: drawPoseOverlay,
    onStatus: (message) => {
        statusText.textContent = message;
    },
    onError: (error) => {
        statusText.textContent = `Error: ${formatError(error)}`;
        startButton.disabled = false;
        stopButton.disabled = true;
    },
});

modelPresetInput.addEventListener("change", () => {
    const preset = parsePoseLandmarkerSpikeModelPreset(modelPresetInput.value);
    if (preset !== "custom") {
        modelPathInput.value = POSE_LANDMARKER_SPIKE_MODEL_PATHS[preset];
    }
});

targetFpsInput.addEventListener("change", () => {
    spike.updateTargetInferenceFps(Number(targetFpsInput.value));
});

startButton.addEventListener("click", () => {
    void startSpike();
});

stopButton.addEventListener("click", () => {
    spike.stop();
    startButton.disabled = false;
    stopButton.disabled = true;
});

markButton.addEventListener("click", () => {
    lastMarkStartedAtMs = performance.now();
    window.requestAnimationFrame(() => {
        if (lastMarkStartedAtMs === undefined) {
            return;
        }
        uiLatency.textContent = `${(performance.now() - lastMarkStartedAtMs).toFixed(1)}ms`;
        lastMarkStartedAtMs = undefined;
    });
});

window.addEventListener("beforeunload", () => {
    spike.stop("page_unload");
});

async function startSpike(): Promise<void> {
    startButton.disabled = true;
    stopButton.disabled = false;
    statusText.textContent = "起動中";
    try {
        await spike.start(readConfig());
    } catch (error) {
        statusText.textContent = `Error: ${formatError(error)}`;
        startButton.disabled = false;
        stopButton.disabled = true;
    }
}

function readConfig(): PoseLandmarkerSpikeConfig {
    return {
        ...DEFAULT_POSE_LANDMARKER_SPIKE_CONFIG,
        modelPreset: parsePoseLandmarkerSpikeModelPreset(modelPresetInput.value),
        modelAssetPath: modelPathInput.value,
        targetInferenceFps: Number(targetFpsInput.value),
        runFaceLandmarker: runFaceLandmarkerInput.checked,
        delegate: parseMediaPipeDelegate(delegateInput.value),
    };
}

function renderMetrics(metrics: PoseLandmarkerSpikeMetrics): void {
    poseMs.textContent = `${metrics.poseInferenceMs.toFixed(1)}ms`;
    poseAvgMax.textContent = `${metrics.poseInferenceAvgMs.toFixed(1)} / ${metrics.poseInferenceMaxMs.toFixed(1)}ms`;
    renderFps.textContent = `${metrics.renderFps.toFixed(1)}fps`;
    faceMs.textContent =
        metrics.faceInferenceMs === undefined
            ? "--"
            : `${metrics.faceInferenceMs.toFixed(1)}ms avg ${metrics.faceInferenceAvgMs?.toFixed(1) ?? "--"}`;
    droppedFrames.textContent =
        metrics.droppedVideoFrames === undefined ? "--" : String(metrics.droppedVideoFrames);
    landmarkSummary.textContent = metrics.detected
        ? metrics.trackedLandmarks
              .map((landmark) => {
                  const status = landmark.stable ? "ok" : "low";
                  return `${landmark.name.padEnd(14)} ${status} visibility=${landmark.visibility.toFixed(2)} x=${landmark.x.toFixed(2)} y=${landmark.y.toFixed(2)}`;
              })
              .join("\n")
        : `pose_not_detected${metrics.fallbackReason ? ` (${metrics.fallbackReason})` : ""}`;
}

function drawPoseOverlay(result: PoseLandmarkerResult | undefined): void {
    if (!overlayContext) {
        return;
    }
    syncCanvasSize();
    overlayContext.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    if (!result || result.landmarks.length === 0) {
        return;
    }
    const landmarks = result.landmarks[0];
    if (!landmarks) {
        return;
    }
    overlayContext.lineWidth = 3;
    overlayContext.strokeStyle = "rgba(76, 201, 240, 0.9)";
    overlayContext.fillStyle = "rgba(255, 209, 102, 0.95)";
    for (const connection of PoseLandmarker.POSE_CONNECTIONS) {
        drawConnection(landmarks, connection.start, connection.end);
    }
    for (const landmark of landmarks) {
        drawPoint(landmark);
    }
}

function syncCanvasSize(): void {
    const width = positiveDimensionOrDefault(previewVideo.videoWidth, previewVideo.clientWidth);
    const height = positiveDimensionOrDefault(previewVideo.videoHeight, previewVideo.clientHeight);
    if (overlayCanvas.width !== width || overlayCanvas.height !== height) {
        overlayCanvas.width = width;
        overlayCanvas.height = height;
    }
}

function drawConnection(
    landmarks: NormalizedLandmark[],
    startIndex: number,
    endIndex: number,
): void {
    const start = landmarks[startIndex];
    const end = landmarks[endIndex];
    if (!start || !end || start.visibility < 0.35 || end.visibility < 0.35) {
        return;
    }
    overlayContext?.beginPath();
    overlayContext?.moveTo(start.x * overlayCanvas.width, start.y * overlayCanvas.height);
    overlayContext?.lineTo(end.x * overlayCanvas.width, end.y * overlayCanvas.height);
    overlayContext?.stroke();
}

function drawPoint(landmark: NormalizedLandmark): void {
    if (landmark.visibility < 0.35) {
        return;
    }
    overlayContext?.beginPath();
    overlayContext?.arc(
        landmark.x * overlayCanvas.width,
        landmark.y * overlayCanvas.height,
        4,
        0,
        Math.PI * 2,
    );
    overlayContext?.fill();
}

type HtmlElementConstructor<T extends HTMLElement> = {
    new (): T;
};

function requireElement<T extends HTMLElement>(
    id: string,
    elementConstructor: HtmlElementConstructor<T>,
): T {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Missing element: ${id}`);
    }
    if (!(element instanceof elementConstructor)) {
        throw new Error(`Element ${id} is not ${elementConstructor.name}.`);
    }
    return element;
}

function formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function positiveDimensionOrDefault(...values: number[]): number {
    return values.find((value) => value > 0) ?? 0;
}

function parsePoseLandmarkerSpikeModelPreset(value: string): PoseLandmarkerSpikeModelPreset {
    if (value === "lite" || value === "full" || value === "heavy" || value === "custom") {
        return value;
    }
    throw new Error(`Unsupported PoseLandmarker model preset: ${value}`);
}

function parseMediaPipeDelegate(value: string): "CPU" | "GPU" {
    if (value === "CPU" || value === "GPU") {
        return value;
    }
    throw new Error(`Unsupported MediaPipe delegate: ${value}`);
}
