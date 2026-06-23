import {
    parseMotionDebugLogLines,
    type SincroMotionDebugFrame,
    type SincroMotionDebugLogManifest,
} from "./motionDebugLogSchema";
import { createMotionDebugRecordingBlob } from "./motionDebugRecorderCompression";
import type {
    MotionDebugRecorderBlobResult,
    MotionDebugRecorderCompression,
    MotionDebugRecorderConfig,
    MotionDebugRecorderFrameInput,
    MotionDebugRecorderManifestInput,
    MotionDebugRecorderNdjsonResult,
    MotionDebugRecorderRecordFrameResult,
    MotionDebugRecorderResult,
    MotionDebugRecorderState,
} from "./motionDebugRecorderTypes";

export type {
    MotionDebugRecorderBlobResult,
    MotionDebugRecorderCompression,
    MotionDebugRecorderConfig,
    MotionDebugRecorderFrameInput,
    MotionDebugRecorderManifestInput,
    MotionDebugRecorderNdjsonResult,
    MotionDebugRecorderRecordFrameResult,
    MotionDebugRecorderResult,
    MotionDebugRecorderState,
} from "./motionDebugRecorderTypes";

const DEFAULT_CONFIG: MotionDebugRecorderConfig = {
    maxDurationMs: 30000,
    maxFrames: 1800,
    compression: "gzip",
};

type DedupeKey = MotionDebugRecorderFrameInput["dedupeKey"];

export class MotionDebugRecorder {
    private readonly config: MotionDebugRecorderConfig;
    private state: MotionDebugRecorderState;
    private manifest?: SincroMotionDebugLogManifest;
    private frames: SincroMotionDebugFrame[] = [];
    private startedAtMs?: number;
    private lastDedupeKey?: DedupeKey;

    constructor(config?: Partial<MotionDebugRecorderConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.state = this.createIdleState();
    }

    start(manifestInput: MotionDebugRecorderManifestInput): MotionDebugRecorderResult {
        if (this.state.status === "recording") {
            return {
                ok: false,
                code: "already_recording",
                message: "Motion debug recorder is already recording.",
                state: this.getState(),
            };
        }

        const manifestValidation = parseMotionDebugLogLines([
            JSON.stringify({ recordType: "manifest", manifest: manifestInput }),
        ]);
        if (!manifestValidation.ok) {
            return {
                ok: false,
                code: "source_not_ready",
                message:
                    manifestValidation.errors[0]?.message ?? "Motion debug manifest is invalid.",
                state: this.getState(),
            };
        }

        const startedAtIso = new Date().toISOString();
        this.manifest = manifestValidation.manifest;
        this.frames = [];
        this.startedAtMs = this.nowMs();
        this.lastDedupeKey = undefined;
        this.state = {
            status: "recording",
            frameCount: 0,
            startedAtIso,
            durationMs: 0,
            compression: this.config.compression,
        };
        return { ok: true, state: this.getState() };
    }

    recordFrame(frameInput: MotionDebugRecorderFrameInput): MotionDebugRecorderRecordFrameResult {
        if (this.state.status !== "recording" || this.manifest === undefined) {
            return {
                ok: false,
                code: "not_recording",
                message: "Motion debug recorder is not recording.",
                state: this.getState(),
            };
        }

        const durationMs = this.updateDuration();
        if (durationMs >= this.config.maxDurationMs) {
            this.stopByLimit("max_duration");
            return {
                ok: false,
                code: "max_duration",
                message: "Motion debug recorder reached maxDurationMs.",
                state: this.getState(),
            };
        }
        if (this.frames.length >= this.config.maxFrames) {
            this.stopByLimit("max_frames");
            return {
                ok: false,
                code: "max_frames",
                message: "Motion debug recorder reached maxFrames.",
                state: this.getState(),
            };
        }

        if (this.isDuplicateFrame(frameInput.dedupeKey)) {
            return {
                ok: true,
                recorded: false,
                skippedReason: "duplicate_frame",
                state: this.getState(),
            };
        }

        const { dedupeKey, ...exportFrameInput } = frameInput;
        const frame: SincroMotionDebugFrame = {
            ...exportFrameInput,
            frameIndex: this.frames.length,
        };
        const validation = parseMotionDebugLogLines([
            JSON.stringify({ recordType: "manifest", manifest: this.manifest }),
            JSON.stringify({ recordType: "frame", frame }),
        ]);
        if (!validation.ok) {
            return {
                ok: false,
                code: "invalid_frame",
                message: validation.errors[0]?.message ?? "Motion debug frame is invalid.",
                state: this.getState(),
            };
        }

        const recordedFrame = validation.frames[0];
        if (recordedFrame === undefined) {
            return {
                ok: false,
                code: "invalid_frame",
                message: "Motion debug frame validation did not return a frame.",
                state: this.getState(),
            };
        }

        this.frames.push(recordedFrame);
        this.lastDedupeKey = { ...dedupeKey };
        this.state.frameCount = this.frames.length;
        this.updateDuration();
        if (this.frames.length >= this.config.maxFrames) {
            this.stopByLimit("max_frames");
        } else if (this.state.durationMs >= this.config.maxDurationMs) {
            this.stopByLimit("max_duration");
        }
        return {
            ok: true,
            recorded: true,
            frameIndex: recordedFrame.frameIndex,
            state: this.getState(),
        };
    }

    stop(reason: MotionDebugRecorderState["stopReason"] = "user"): MotionDebugRecorderResult {
        if (this.state.status !== "recording") {
            return {
                ok: false,
                code: "not_recording",
                message: "Motion debug recorder is not recording.",
                state: this.getState(),
            };
        }
        this.updateDuration();
        this.state = {
            ...this.state,
            status: "stopped",
            stopReason: reason,
        };
        return { ok: true, state: this.getState() };
    }

    exportNdjson(): MotionDebugRecorderNdjsonResult {
        if (this.state.status !== "stopped") {
            return {
                ok: false,
                code: "not_stopped",
                message: "Motion debug recorder must be stopped before export.",
                state: this.getState(),
            };
        }
        if (this.manifest === undefined || this.frames.length === 0) {
            return {
                ok: false,
                code: "no_frames",
                message: "Motion debug recorder has no frames to export.",
                state: this.getState(),
            };
        }

        const lines = this.createNdjsonLines();
        const validation = parseMotionDebugLogLines(lines);
        if (!validation.ok) {
            return this.exportFailed(
                validation.errors[0]?.message ?? "Motion debug NDJSON validation failed.",
            );
        }
        return {
            ok: true,
            ndjson: `${lines.join("\n")}\n`,
            state: this.getState(),
        };
    }

    async exportBlob(options?: {
        compression?: MotionDebugRecorderCompression;
    }): Promise<MotionDebugRecorderBlobResult> {
        const ndjsonResult = this.exportNdjson();
        if (!ndjsonResult.ok) {
            return ndjsonResult;
        }

        const requestedCompression = options?.compression ?? this.config.compression;
        this.state = {
            ...this.state,
            status: "exporting",
            compression: requestedCompression,
            compressionFallbackReason: undefined,
            lastError: undefined,
        };

        if (requestedCompression === "none") {
            this.state = {
                ...this.state,
                status: "stopped",
                compression: "none",
                compressionFallbackReason: undefined,
            };
        }

        const blob = await createMotionDebugRecordingBlob(
            ndjsonResult.ndjson,
            requestedCompression,
        );
        this.state = {
            ...this.state,
            status: "stopped",
            compression: blob.compression,
            compressionFallbackReason: blob.fallbackReason,
        };
        return {
            ok: true,
            blob: blob.blob,
            compression: blob.compression,
            fileExtension: blob.fileExtension,
            mimeType: blob.mimeType,
            state: this.getState(),
        };
    }

    getState(): MotionDebugRecorderState {
        if (this.state.status === "recording") {
            this.updateDuration();
        }
        return { ...this.state };
    }

    private createIdleState(): MotionDebugRecorderState {
        return {
            status: "idle",
            frameCount: 0,
            durationMs: 0,
            compression: this.config.compression,
        };
    }

    private createNdjsonLines(): string[] {
        return [
            JSON.stringify({ recordType: "manifest", manifest: this.manifest }),
            ...this.frames.map((frame) => JSON.stringify({ recordType: "frame", frame })),
        ];
    }

    private exportFailed(message: string): MotionDebugRecorderNdjsonResult {
        this.state = {
            ...this.state,
            status: "error",
            stopReason: "error",
            lastError: message,
        };
        return {
            ok: false,
            code: "export_failed",
            message,
            state: this.getState(),
        };
    }

    private stopByLimit(reason: "max_duration" | "max_frames"): void {
        this.updateDuration();
        this.state = {
            ...this.state,
            status: "stopped",
            stopReason: reason,
        };
    }

    private updateDuration(): number {
        if (this.startedAtMs === undefined) {
            this.state.durationMs = 0;
            return 0;
        }
        this.state.durationMs = Math.max(0, this.nowMs() - this.startedAtMs);
        return this.state.durationMs;
    }

    private isDuplicateFrame(dedupeKey: DedupeKey): boolean {
        if (this.lastDedupeKey === undefined) {
            return false;
        }
        return (
            this.lastDedupeKey.mediaTimeMs === dedupeKey.mediaTimeMs &&
            (this.lastDedupeKey.poseLastUpdatedAtMs ?? null) ===
                (dedupeKey.poseLastUpdatedAtMs ?? null)
        );
    }

    private nowMs(): number {
        return performance.now();
    }
}
