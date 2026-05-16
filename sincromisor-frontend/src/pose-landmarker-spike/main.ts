import type { NormalizedLandmark, PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import { PoseLandmarker } from "@mediapipe/tasks-vision";
import type {
    PoseLandmarkerSpikeConfig,
    PoseLandmarkerSpikeMetrics,
    PoseLandmarkerSpikeModelPreset,
} from "../ts/CharacterGaze/PoseLandmarkerSpike";
import {
    DEFAULT_POSE_LANDMARKER_SPIKE_CONFIG,
    POSE_LANDMARKER_SPIKE_MODEL_PATHS,
    PoseLandmarkerSpike,
} from "../ts/CharacterGaze/PoseLandmarkerSpike";
import "./styles.css";

const previewVideo = requireElement<HTMLVideoElement>("previewVideo");
const overlayCanvas = requireElement<HTMLCanvasElement>("overlayCanvas");
const modelPresetInput = requireElement<HTMLSelectElement>("modelPreset");
const modelPathInput = requireElement<HTMLInputElement>("modelPath");
const targetFpsInput = requireElement<HTMLSelectElement>("targetFps");
const delegateInput = requireElement<HTMLSelectElement>("delegate");
const runFaceLandmarkerInput = requireElement<HTMLInputElement>("runFaceLandmarker");
const startButton = requireElement<HTMLButtonElement>("startButton");
const stopButton = requireElement<HTMLButtonElement>("stopButton");
const markButton = requireElement<HTMLButtonElement>("markButton");
const statusText = requireElement<HTMLParagraphElement>("statusText");
const poseMs = requireElement<HTMLElement>("poseMs");
const poseAvgMax = requireElement<HTMLElement>("poseAvgMax");
const renderFps = requireElement<HTMLElement>("renderFps");
const faceMs = requireElement<HTMLElement>("faceMs");
const droppedFrames = requireElement<HTMLElement>("droppedFrames");
const uiLatency = requireElement<HTMLElement>("uiLatency");
const landmarkSummary = requireElement<HTMLPreElement>("landmarkSummary");
const overlayContext = overlayCanvas.getContext("2d");

let lastMarkStartedAtMs: number | null = null;

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
    const preset = modelPresetInput.value as PoseLandmarkerSpikeModelPreset;
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
        if (lastMarkStartedAtMs == null) {
            return;
        }
        uiLatency.textContent = `${(performance.now() - lastMarkStartedAtMs).toFixed(1)}ms`;
        lastMarkStartedAtMs = null;
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
        modelPreset: modelPresetInput.value as PoseLandmarkerSpikeModelPreset,
        modelAssetPath: modelPathInput.value,
        targetInferenceFps: Number(targetFpsInput.value),
        runFaceLandmarker: runFaceLandmarkerInput.checked,
        delegate: delegateInput.value as "CPU" | "GPU",
    };
}

function renderMetrics(metrics: PoseLandmarkerSpikeMetrics): void {
    poseMs.textContent = `${metrics.poseInferenceMs.toFixed(1)}ms`;
    poseAvgMax.textContent = `${metrics.poseInferenceAvgMs.toFixed(1)} / ${metrics.poseInferenceMaxMs.toFixed(1)}ms`;
    renderFps.textContent = `${metrics.renderFps.toFixed(1)}fps`;
    faceMs.textContent =
        metrics.faceInferenceMs == null
            ? "--"
            : `${metrics.faceInferenceMs.toFixed(1)}ms avg ${metrics.faceInferenceAvgMs?.toFixed(1) ?? "--"}`;
    droppedFrames.textContent =
        metrics.droppedVideoFrames == null ? "--" : String(metrics.droppedVideoFrames);
    landmarkSummary.textContent = metrics.detected
        ? metrics.trackedLandmarks
              .map((landmark) => {
                  const status = landmark.stable ? "ok" : "low";
                  return `${landmark.name.padEnd(14)} ${status} visibility=${landmark.visibility.toFixed(2)} x=${landmark.x.toFixed(2)} y=${landmark.y.toFixed(2)}`;
              })
              .join("\n")
        : `pose_not_detected${metrics.fallbackReason ? ` (${metrics.fallbackReason})` : ""}`;
}

function drawPoseOverlay(result: PoseLandmarkerResult | null): void {
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
    const width = previewVideo.videoWidth || previewVideo.clientWidth;
    const height = previewVideo.videoHeight || previewVideo.clientHeight;
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

function requireElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Missing element: ${id}`);
    }
    return element as T;
}

function formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
