import type {
    SincroPoseArmIkMode,
    SincroPoseRetargetConfig,
} from "../ts/SincroVRM/VRMCharacter/SincroPoseRetargeter";
import { requireElement } from "./dom";
import type { MotionDebugRetargetUiConfig, MotionDebugStatus } from "./types";

type MotionDebugControlCallbacks = {
    onStart: () => void;
    onStop: () => void;
    onCapture: () => void;
    onRetargetConfigChange: (config: MotionDebugRetargetUiConfig) => void;
};

// DOM control の読み書きを runtime から分離する。Playwright API と画面操作は
// MotionDebugApp の同じ setRetargetConfig() に合流させ、調整経路を 1 つに保つ。
export class MotionDebugControls {
    private readonly statusText = requireElement<HTMLElement>("motionDebugStatus");
    private readonly snapshotText = requireElement<HTMLPreElement>("motionDebugSnapshot");
    private readonly startButton = requireElement<HTMLButtonElement>("motionDebugStart");
    private readonly stopButton = requireElement<HTMLButtonElement>("motionDebugStop");
    private readonly captureButton = requireElement<HTMLButtonElement>("motionDebugCapture");
    private readonly ikModeInput = requireElement<HTMLSelectElement>("motionDebugIkMode");
    private readonly ikStrengthInput = requireElement<HTMLInputElement>("motionDebugIkStrength");
    private readonly targetScaleInput = requireElement<HTMLInputElement>("motionDebugTargetScale");
    private readonly smoothingInput = requireElement<HTMLInputElement>("motionDebugSmoothing");
    private readonly minConfidenceInput = requireElement<HTMLInputElement>(
        "motionDebugMinConfidence",
    );
    private readonly ikStrengthValue = requireElement<HTMLOutputElement>(
        "motionDebugIkStrengthValue",
    );
    private readonly targetScaleValue = requireElement<HTMLOutputElement>(
        "motionDebugTargetScaleValue",
    );
    private readonly smoothingValue = requireElement<HTMLOutputElement>(
        "motionDebugSmoothingValue",
    );
    private readonly minConfidenceValue = requireElement<HTMLOutputElement>(
        "motionDebugMinConfidenceValue",
    );
    private readonly captureResult = requireElement<HTMLElement>("motionDebugCaptureResult");
    private readonly capturePreview = requireElement<HTMLImageElement>("motionDebugCapturePreview");
    private readonly captureDownload = requireElement<HTMLAnchorElement>(
        "motionDebugCaptureDownload",
    );
    private readonly captureStatus = requireElement<HTMLElement>("motionDebugCaptureStatus");

    constructor(callbacks: MotionDebugControlCallbacks) {
        this.startButton.addEventListener("click", callbacks.onStart);
        this.stopButton.addEventListener("click", callbacks.onStop);
        this.captureButton.addEventListener("click", callbacks.onCapture);
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

    renderSnapshot(snapshot: unknown): void {
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
            armIkMode: this.ikModeInput.value as SincroPoseArmIkMode,
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
