import type {
    SincroPoseArmIkMode,
    SincroPoseRetargetConfig,
} from "../../character/retargeting/sincroPoseRetargeter";
import { requireElement } from "./dom";
import { MotionDebugViewerRenderer } from "./motionDebugViewerRenderer";
import type {
    MotionDebugLayerKey,
    MotionDebugRecordingDownloadResult,
    MotionDebugRetargetUiConfig,
    MotionDebugSnapshot,
    MotionDebugStatus,
    MotionDebugViewerMode,
} from "./types";

type MotionDebugControlCallbacks = {
    onStart: () => void;
    onStop: () => void;
    onCapture: () => void;
    onRecordStart: () => void;
    onRecordStop: () => void;
    onRecordDownload: () => void;
    onRetargetConfigChange: (config: MotionDebugRetargetUiConfig) => void;
    onViewerModeChange: (mode: MotionDebugViewerMode) => void;
    onViewerLayerChange: (layer: MotionDebugLayerKey) => void;
};

// DOM control の読み書きを runtime から分離する。Playwright API と画面操作は
// MotionDebugApp の同じ setRetargetConfig() に合流させ、調整経路を 1 つに保つ。
export class MotionDebugControls {
    private readonly statusText = requireElement("motionDebugStatus", HTMLElement);
    private readonly snapshotText = requireElement("motionDebugSnapshotRaw", HTMLPreElement);
    private readonly startButton = requireElement("motionDebugStart", HTMLButtonElement);
    private readonly stopButton = requireElement("motionDebugStop", HTMLButtonElement);
    private readonly captureButton = requireElement("motionDebugCapture", HTMLButtonElement);
    private readonly recordStartButton = requireElement(
        "motionDebugRecordStart",
        HTMLButtonElement,
    );
    private readonly recordStopButton = requireElement("motionDebugRecordStop", HTMLButtonElement);
    private readonly recordDownloadButton = requireElement(
        "motionDebugRecordDownload",
        HTMLButtonElement,
    );
    private readonly recordStatus = requireElement("motionDebugRecordStatus", HTMLElement);
    private readonly ikModeInput = requireElement("motionDebugIkMode", HTMLSelectElement);
    private readonly ikStrengthInput = requireElement("motionDebugIkStrength", HTMLInputElement);
    private readonly targetScaleInput = requireElement("motionDebugTargetScale", HTMLInputElement);
    private readonly smoothingInput = requireElement("motionDebugSmoothing", HTMLInputElement);
    private readonly minConfidenceInput = requireElement(
        "motionDebugMinConfidence",
        HTMLInputElement,
    );
    private readonly ikStrengthValue = requireElement(
        "motionDebugIkStrengthValue",
        HTMLOutputElement,
    );
    private readonly targetScaleValue = requireElement(
        "motionDebugTargetScaleValue",
        HTMLOutputElement,
    );
    private readonly smoothingValue = requireElement(
        "motionDebugSmoothingValue",
        HTMLOutputElement,
    );
    private readonly minConfidenceValue = requireElement(
        "motionDebugMinConfidenceValue",
        HTMLOutputElement,
    );
    private readonly captureResult = requireElement("motionDebugCaptureResult", HTMLElement);
    private readonly capturePreview = requireElement("motionDebugCapturePreview", HTMLImageElement);
    private readonly captureDownload = requireElement(
        "motionDebugCaptureDownload",
        HTMLAnchorElement,
    );
    private readonly captureStatus = requireElement("motionDebugCaptureStatus", HTMLElement);
    private readonly viewerRenderer: MotionDebugViewerRenderer;

    constructor(callbacks: MotionDebugControlCallbacks) {
        this.viewerRenderer = new MotionDebugViewerRenderer({
            onViewerModeChange: callbacks.onViewerModeChange,
            onViewerLayerChange: callbacks.onViewerLayerChange,
        });
        this.startButton.addEventListener("click", callbacks.onStart);
        this.stopButton.addEventListener("click", callbacks.onStop);
        this.captureButton.addEventListener("click", callbacks.onCapture);
        this.recordStartButton.addEventListener("click", callbacks.onRecordStart);
        this.recordStopButton.addEventListener("click", callbacks.onRecordStop);
        this.recordDownloadButton.addEventListener("click", callbacks.onRecordDownload);
        for (const element of this.retargetInputs()) {
            element.addEventListener("input", () => {
                callbacks.onRetargetConfigChange(this.readRetargetConfig());
            });
        }
    }

    setStatus(status: MotionDebugStatus, message: string): void {
        this.statusText.textContent = message;
        this.startButton.disabled = status === "loading" || status === "running";
        this.stopButton.disabled = status !== "loading" && status !== "running";
    }

    renderRecordingState(snapshot: {
        status: string;
        frameCount: number;
        durationMs: number;
    }): void {
        this.recordStartButton.disabled =
            snapshot.status === "recording" || snapshot.status === "exporting";
        this.recordStopButton.disabled = snapshot.status !== "recording";
        this.recordDownloadButton.disabled =
            snapshot.status !== "stopped" || snapshot.frameCount === 0;
        this.recordStatus.textContent = `${snapshot.status} / ${snapshot.frameCount} frames / ${Math.round(snapshot.durationMs)}ms`;
    }

    renderRecordingDownload(result: MotionDebugRecordingDownloadResult): void {
        if (result.ok) {
            this.recordStatus.textContent = `downloaded ${result.fileName} (${result.byteLength} bytes)`;
            return;
        }
        this.recordStatus.textContent = `${result.code}: ${result.message}`;
    }

    renderSnapshot(snapshot: MotionDebugSnapshot): void {
        if (snapshot.viewer !== undefined) {
            this.viewerRenderer.render(snapshot.viewer, snapshot);
        }
        this.snapshotText.textContent = JSON.stringify(snapshot, null, 2);
    }

    renderCapture(dataUrl: string, capturedAtMs: number | undefined): void {
        const capturedAtText =
            capturedAtMs === undefined ? "--" : `${(capturedAtMs / 1000).toFixed(2)}s`;
        this.capturePreview.src = dataUrl;
        this.captureDownload.href = dataUrl;
        this.captureDownload.download = this.captureFileName();
        this.captureStatus.textContent = `Captured ${capturedAtText}`;
        this.captureResult.hidden = false;
    }

    syncConfig(config: MotionDebugRetargetUiConfig): void {
        this.ikModeInput.value = config.armIkMode;
        this.ikStrengthInput.value = `${config.armIkStrength}`;
        this.targetScaleInput.value = `${config.armIkTargetScale}`;
        this.smoothingInput.value = `${config.smoothingMs}`;
        this.minConfidenceInput.value = `${config.minConfidence}`;
        this.ikStrengthValue.value = config.armIkStrength.toFixed(2);
        this.targetScaleValue.value = config.armIkTargetScale.toFixed(2);
        this.smoothingValue.value = `${Math.round(config.smoothingMs)}ms`;
        this.minConfidenceValue.value = config.minConfidence.toFixed(2);
    }

    pickRetargetConfig(
        config: Partial<SincroPoseRetargetConfig>,
        current: MotionDebugRetargetUiConfig,
    ): MotionDebugRetargetUiConfig {
        return {
            armIkMode: config.armIkMode ?? current.armIkMode,
            armIkStrength: config.armIkStrength ?? current.armIkStrength,
            armIkTargetScale: config.armIkTargetScale ?? current.armIkTargetScale,
            smoothingMs: config.smoothingMs ?? current.smoothingMs,
            minConfidence: config.minConfidence ?? current.minConfidence,
        };
    }

    private readRetargetConfig(): MotionDebugRetargetUiConfig {
        return {
            armIkMode: parseSincroPoseArmIkMode(this.ikModeInput.value),
            armIkStrength: Number(this.ikStrengthInput.value),
            armIkTargetScale: Number(this.targetScaleInput.value),
            smoothingMs: Number(this.smoothingInput.value),
            minConfidence: Number(this.minConfidenceInput.value),
        };
    }

    private retargetInputs(): HTMLElement[] {
        return [
            this.ikModeInput,
            this.ikStrengthInput,
            this.targetScaleInput,
            this.smoothingInput,
            this.minConfidenceInput,
        ];
    }

    private captureFileName(): string {
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        return `sincro-motion-debug-${stamp}.png`;
    }
}

function parseSincroPoseArmIkMode(value: string): SincroPoseArmIkMode {
    if (value === "feature_only" || value === "screen_space_ik" || value === "world_3d_ik") {
        return value;
    }
    throw new Error(`Unsupported arm IK mode: ${value}`);
}
