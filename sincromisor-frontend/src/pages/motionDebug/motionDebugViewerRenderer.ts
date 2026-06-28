/**
 * MotionDebugViewerSnapshot を DOM 表示へ反映する renderer。
 * JSON 表示は developer-facing debug surface であり、snapshot の parse / metric 計算や state mutation は行わない。
 */
import { MOTION_METRIC_KEYS } from "../../character/motionEvaluation/motionMetrics";
import { requireElement } from "./dom";
import { MOTION_DEBUG_LAYER_KEYS, MOTION_DEBUG_VIEWER_MODES } from "./motionDebugViewerModel";
import type {
    MotionDebugLayerKey,
    MotionDebugSnapshot,
    MotionDebugViewerMode,
    MotionDebugViewerSnapshot,
} from "./types";

type MotionDebugViewerRendererCallbacks = {
    onViewerModeChange: (mode: MotionDebugViewerMode) => void;
    onViewerLayerChange: (layer: MotionDebugLayerKey) => void;
};

export class MotionDebugViewerRenderer {
    private readonly viewerModeInput = requireElement("motionDebugViewerMode", HTMLSelectElement);
    private readonly viewerLayerInput = requireElement("motionDebugLayer", HTMLSelectElement);
    private readonly viewerLayerStatus = requireElement("motionDebugLayerStatus", HTMLElement);
    private readonly viewerSummary = requireElement("motionDebugViewerSummary", HTMLElement);
    private readonly viewerLayerValue = requireElement("motionDebugLayerValue", HTMLPreElement);
    private readonly metricsPanel = requireElement("motionDebugMetricsPanel", HTMLElement);
    private readonly metricsTableBody = requireElement(
        "motionDebugMetricsTableBody",
        HTMLTableSectionElement,
    );

    constructor(callbacks: MotionDebugViewerRendererCallbacks) {
        this.populateViewerSelectors();
        this.viewerModeInput.addEventListener("change", () => {
            callbacks.onViewerModeChange(parseViewerMode(this.viewerModeInput.value));
        });
        this.viewerLayerInput.addEventListener("change", () => {
            callbacks.onViewerLayerChange(parseLayerKey(this.viewerLayerInput.value));
        });
    }

    render(viewer: MotionDebugViewerSnapshot, snapshot: MotionDebugSnapshot): void {
        this.viewerModeInput.value = viewer.mode;
        this.viewerLayerInput.value = viewer.selectedLayer;
        const selectedLayer = viewer.layers[viewer.selectedLayer];
        this.viewerLayerStatus.textContent = `${selectedLayer.label}: ${selectedLayer.status}`;
        this.viewerLayerStatus.dataset.status = selectedLayer.status;
        this.viewerLayerValue.textContent =
            selectedLayer.value === undefined ? "--" : JSON.stringify(selectedLayer.value, null, 2);
        this.renderViewerSummary(viewer, snapshot);
        this.renderMetrics(viewer);
    }

    private populateViewerSelectors(): void {
        this.viewerModeInput.replaceChildren(
            ...MOTION_DEBUG_VIEWER_MODES.map((mode) => createOption(mode, mode)),
        );
        this.viewerLayerInput.replaceChildren(
            ...MOTION_DEBUG_LAYER_KEYS.map((layer) => createOption(layer, layer)),
        );
    }

    private renderViewerSummary(
        viewer: MotionDebugViewerSnapshot,
        snapshot: MotionDebugSnapshot,
    ): void {
        const rows =
            viewer.mode === "recording"
                ? recordingRows(viewer)
                : viewer.mode === "replay"
                  ? replayRows(viewer, snapshot)
                  : viewer.mode === "metrics"
                    ? metricsRows(viewer)
                    : liveRows(snapshot);
        this.viewerSummary.replaceChildren(
            ...rows.map(([label, value]) => createSummaryRow(label, value)),
        );
    }

    private renderMetrics(viewer: MotionDebugViewerSnapshot): void {
        const metrics = viewer.metrics;
        this.metricsPanel.hidden = viewer.mode !== "metrics";
        this.metricsTableBody.replaceChildren();
        if (metrics === undefined) {
            this.metricsTableBody.append(createMetricEmptyRow("not calculated"));
            return;
        }
        const rows = MOTION_METRIC_KEYS.map((key) => {
            const metric = metrics.metrics[key];
            const comparison = viewer.metricComparison?.[key];
            const row = document.createElement("tr");
            row.dataset.status = metric.status;
            row.append(
                createCell(key),
                createCell(formatMetricValue(metric.value, metric.unit)),
                createCell(metric.status),
                createCell(metric.severity),
                createCell(formatThreshold(metric.threshold)),
                createCell(comparison?.status ?? "not compared"),
            );
            return row;
        });
        this.metricsTableBody.append(...rows);
    }
}

function parseViewerMode(value: string): MotionDebugViewerMode {
    if (value === "live" || value === "recording" || value === "replay" || value === "metrics") {
        return value;
    }
    throw new Error(`Unsupported motion debug viewer mode: ${value}`);
}

function parseLayerKey(value: string): MotionDebugLayerKey {
    for (const layer of MOTION_DEBUG_LAYER_KEYS) {
        if (value === layer) {
            return layer;
        }
    }
    throw new Error(`Unsupported motion debug layer: ${value}`);
}

function createOption(value: string, label: string): HTMLOptionElement {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    return option;
}

function liveRows(snapshot: MotionDebugSnapshot): [string, string][] {
    return [
        ["mode", "live"],
        ["camera", snapshot.camera.source],
        ["pose detected", `${snapshot.pose.detected}`],
        ["render fps", snapshot.render.renderFps.toFixed(1)],
    ];
}

function recordingRows(viewer: MotionDebugViewerSnapshot): [string, string][] {
    const recording = viewer.recording;
    if (recording === undefined) {
        return [["recording", "not available"]];
    }
    return [
        ["status", recording.status],
        ["frame count", `${recording.frameCount}`],
        ["duration", `${Math.round(recording.durationMs)}ms`],
        ["compression", recording.compression],
        ["compression fallback", recording.compressionFallbackReason ?? "none"],
        [
            "scrubbed camera settings",
            recording.scrubbedCameraSettings === true ? "present" : "absent",
        ],
    ];
}

function replayRows(
    viewer: MotionDebugViewerSnapshot,
    snapshot: MotionDebugSnapshot,
): [string, string][] {
    const replay = viewer.replay;
    if (replay === undefined) {
        return [["replay", "not available"]];
    }
    const lastResult = replay.lastResult;
    const sourceTimestamp =
        lastResult?.ok === true ? `${Math.round(lastResult.mediaTimeMs)}ms` : "--";
    const determinism =
        lastResult === undefined ? "not checked" : lastResult.ok ? "ok" : lastResult.code;
    return [
        ["status", replay.status],
        ["replay mode", replay.mode ?? "--"],
        ["current frame", formatFrameIndex(replay.currentFrameIndex, replay.frameCount)],
        ["source timestamp", sourceTimestamp],
        ["determinism check", determinism],
        ["latest poseRetarget", summarizePoseRetarget(snapshot.poseRetargetRuntime)],
    ];
}

function metricsRows(viewer: MotionDebugViewerSnapshot): [string, string][] {
    const metrics = viewer.metrics;
    if (metrics === undefined) {
        return [["metrics", "not calculated"]];
    }
    return [
        ["severity", metrics.severity],
        ["frame count", `${metrics.frameCount}`],
        ["duration", `${Math.round(metrics.durationMs)}ms`],
        ["fixture", metrics.fixtureId ?? "--"],
        ["generated", metrics.generatedAtIso],
    ];
}

function createSummaryRow(label: string, value: string): HTMLElement {
    const row = document.createElement("div");
    row.className = "viewerSummaryRow";
    const labelElement = document.createElement("span");
    labelElement.textContent = label;
    const valueElement = document.createElement("output");
    valueElement.textContent = value;
    row.append(labelElement, valueElement);
    return row;
}

function createCell(text: string): HTMLTableCellElement {
    const cell = document.createElement("td");
    cell.textContent = text;
    return cell;
}

function createMetricEmptyRow(text: string): HTMLTableRowElement {
    const row = document.createElement("tr");
    const cell = createCell(text);
    cell.colSpan = 6;
    row.append(cell);
    return row;
}

function formatFrameIndex(index: number | undefined, frameCount: number): string {
    return index === undefined ? `--/${frameCount}` : `${index + 1}/${frameCount}`;
}

function formatMetricValue(value: number | null, unit: string): string {
    return value === null ? "not_available" : `${Number(value.toFixed(4))} ${unit}`;
}

function formatThreshold(threshold: { pass: number; warn: number; fail: number }): string {
    return `pass ${threshold.pass} / warn ${threshold.warn} / fail ${threshold.fail}`;
}

function summarizePoseRetarget(snapshot: MotionDebugSnapshot["poseRetargetRuntime"]): string {
    return `left ${snapshot.leftArm.ikSolverMode}:${snapshot.leftArm.constraint.reasons.length} constraints / right ${snapshot.rightArm.ikSolverMode}:${snapshot.rightArm.constraint.reasons.length} constraints`;
}
