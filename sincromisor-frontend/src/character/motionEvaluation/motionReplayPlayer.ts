/**
 * motion-debug replay log を frame index / playback mode 付きで適用する stateful player。
 *
 * player は replay log の入力検証と frame context の維持だけを担当する。MediaPipe raw result からの snapshot
 * 正規化や DOM / VRM 更新は caller-provided callback へ委譲し、raw slot 欠損を pose-snapshot fallback で
 * 隠さない。
 */
import type { SincroPoseMotionSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import {
    parseMotionDebugLogLines,
    type SincroMotionDebugFrame,
    type SincroMotionDebugLogManifest,
} from "./motionDebugLogSchema";
import { parseReplayPoseSnapshot } from "./motionReplayPoseSnapshotSchema";
import {
    type MotionReplayRawResultParseError,
    parseMotionReplayRawResultFrame,
    type SincroMotionReplayRawResultFrame,
} from "./motionReplayRawResultSchema";

export type MotionReplayMode = "pose-snapshot" | "final-pose-playback" | "mediapipe-raw-result";

export type MotionReplayErrorCode =
    | "unsupported_mode"
    | "missing_mediapipe_raw_result"
    | "missing_pose_snapshot"
    | "missing_final_pose"
    | "parse_error"
    | "frame_index_out_of_range"
    | "no_recording_loaded";

export type MotionReplayFrameResult<TSnapshot = unknown> =
    | {
          ok: true;
          mode: MotionReplayMode;
          frameIndex: number;
          mediaTimeMs: number;
          snapshot: TSnapshot;
      }
    | {
          ok: false;
          mode: MotionReplayMode;
          frameIndex?: number;
          code: MotionReplayErrorCode;
          message: string;
          parseErrors?: MotionReplayRawResultParseError[];
      };

export type MotionReplayState<TSnapshot = unknown> = {
    status: "idle" | "loaded" | "playing" | "paused" | "stopped" | "error";
    mode?: MotionReplayMode;
    frameCount: number;
    currentFrameIndex?: number;
    lastResult?: MotionReplayFrameResult<TSnapshot>;
};

export type MotionReplayLoadResult<TSnapshot = unknown> =
    | { ok: true; state: MotionReplayState<TSnapshot> }
    | { ok: false; code: "parse_error" | "unsupported_input"; message: string };

export type MotionReplayApplyContext = {
    frameIndex: number;
    mediaTimeMs: number;
    frame: SincroMotionDebugFrame;
};

export type MotionReplayPlayerOptions<TSnapshot> = {
    applyPoseSnapshot: (
        snapshot: SincroPoseMotionSnapshot,
        context: MotionReplayApplyContext,
    ) => TSnapshot;
    readSnapshot: () => TSnapshot;
    /**
     * `mediapipe-raw-result` mode の適用境界。
     *
     * `raw` は `frame.mediapipe` を schema parse した plain object で、MediaPipe class instance や
     * transferable object は含まない。callback は既存 normalizer/parser を通して snapshot を生成し、
     * `MotionReplayApplyContext` の `frameIndex`、`mediaTimeMs`、`frame` の意味を pose-snapshot mode と揃える。
     */
    applyRawResult?: (
        raw: SincroMotionReplayRawResultFrame,
        context: MotionReplayApplyContext,
    ) => TSnapshot;
    previewFinalPose?: (finalPose: unknown, context: MotionReplayApplyContext) => TSnapshot;
};

export class MotionReplayPlayer<TSnapshot = unknown> {
    private manifest?: SincroMotionDebugLogManifest;
    private frames: SincroMotionDebugFrame[] = [];
    private state: MotionReplayState<TSnapshot> = {
        status: "idle",
        frameCount: 0,
    };

    constructor(private readonly options: MotionReplayPlayerOptions<TSnapshot>) {}

    loadRecordingText(text: string): MotionReplayLoadResult<TSnapshot> {
        const lines = text
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
        const parsed = parseMotionDebugLogLines(lines);
        if (!parsed.ok) {
            this.state = {
                status: "error",
                frameCount: 0,
            };
            return {
                ok: false,
                code: "parse_error",
                message: parsed.errors[0]?.message ?? "Motion debug log parse failed.",
            };
        }

        this.manifest = parsed.manifest;
        this.frames = parsed.frames;
        this.state = {
            status: "loaded",
            frameCount: this.frames.length,
        };
        return { ok: true, state: this.getReplayState() };
    }

    startReplay(options: {
        mode: MotionReplayMode;
        autoplay?: boolean;
    }): MotionReplayFrameResult<TSnapshot> {
        this.state = {
            ...this.state,
            status: options.autoplay === true ? "playing" : "paused",
            mode: options.mode,
            currentFrameIndex: undefined,
            lastResult: undefined,
        };
        return this.applyFrame(options.mode, 0);
    }

    stepReplay(
        frameIndex: number,
        options?: { autoplay?: boolean },
    ): MotionReplayFrameResult<TSnapshot> {
        const mode = this.state.mode ?? "pose-snapshot";
        this.state = {
            ...this.state,
            status: options?.autoplay === true ? "playing" : "paused",
            mode,
        };
        return this.applyFrame(mode, frameIndex);
    }

    stopReplay(): MotionReplayState<TSnapshot> {
        this.state = {
            ...this.state,
            status: "stopped",
        };
        return this.getReplayState();
    }

    getReplayState(): MotionReplayState<TSnapshot> {
        return {
            ...this.state,
        };
    }

    frameCount(): number {
        return this.frames.length;
    }

    frameMediaTimeMs(frameIndex: number): number | undefined {
        return this.frames[frameIndex]?.timestamp.mediaTimeMs;
    }

    hasLoadedRecording(): boolean {
        return this.manifest !== undefined;
    }

    replayFrames(): readonly SincroMotionDebugFrame[] {
        return this.frames;
    }

    replayManifest(): SincroMotionDebugLogManifest | undefined {
        return this.manifest;
    }

    replayFrame(
        frameIndex: number | undefined = this.state.currentFrameIndex,
    ): SincroMotionDebugFrame | undefined {
        if (frameIndex === undefined) {
            return undefined;
        }
        return this.frames[frameIndex];
    }

    private applyFrame(
        mode: MotionReplayMode,
        frameIndex: number,
    ): MotionReplayFrameResult<TSnapshot> {
        if (this.manifest === undefined) {
            return this.setLastResult({
                ok: false,
                mode,
                code: "no_recording_loaded",
                message: "Motion replay has no loaded recording.",
            });
        }
        const frame = this.frames[frameIndex];
        if (frame === undefined) {
            return this.setLastResult({
                ok: false,
                mode,
                frameIndex,
                code: "frame_index_out_of_range",
                message: "Motion replay frame index is out of range.",
            });
        }

        if (mode === "mediapipe-raw-result") {
            return this.applyRawResultFrame(frame, frameIndex);
        }
        if (mode === "final-pose-playback") {
            return this.applyFinalPoseFrame(frame, frameIndex);
        }
        return this.applyPoseSnapshotFrame(frame, frameIndex);
    }

    private applyRawResultFrame(
        frame: SincroMotionDebugFrame,
        frameIndex: number,
    ): MotionReplayFrameResult<TSnapshot> {
        if (this.options.applyRawResult === undefined) {
            return this.setLastResult({
                ok: false,
                mode: "mediapipe-raw-result",
                frameIndex,
                code: "unsupported_mode",
                message: "Motion replay mode requires applyRawResult.",
            });
        }
        if (frame.mediapipe === undefined) {
            return this.setLastResult({
                ok: false,
                mode: "mediapipe-raw-result",
                frameIndex,
                code: "missing_mediapipe_raw_result",
                message: "Motion replay frame is missing frame.mediapipe.",
            });
        }
        const parsed = parseMotionReplayRawResultFrame(frame.mediapipe);
        if (!parsed.ok) {
            return this.setLastResult({
                ok: false,
                mode: "mediapipe-raw-result",
                frameIndex,
                code: "parse_error",
                message: `Motion replay frame.mediapipe parse failed at ${formatRawParseSlots(parsed.errors)}.`,
                parseErrors: parsed.errors,
            });
        }

        return this.setLastResult({
            ok: true,
            mode: "mediapipe-raw-result",
            frameIndex,
            mediaTimeMs: frame.timestamp.mediaTimeMs,
            snapshot: this.options.applyRawResult(parsed.frame, {
                frameIndex,
                mediaTimeMs: frame.timestamp.mediaTimeMs,
                frame,
            }),
        });
    }

    private applyPoseSnapshotFrame(
        frame: SincroMotionDebugFrame,
        frameIndex: number,
    ): MotionReplayFrameResult<TSnapshot> {
        if (frame.poseSnapshot === undefined) {
            return this.setLastResult({
                ok: false,
                mode: "pose-snapshot",
                frameIndex,
                code: "missing_pose_snapshot",
                message: "Motion replay frame is missing frame.poseSnapshot.",
            });
        }

        const poseSnapshot = this.parsePoseSnapshot(frame.poseSnapshot);
        if (poseSnapshot === undefined) {
            return this.setLastResult({
                ok: false,
                mode: "pose-snapshot",
                frameIndex,
                code: "parse_error",
                message: "Motion replay frame.poseSnapshot is not a SincroPoseMotionSnapshot.",
            });
        }

        return this.setLastResult({
            ok: true,
            mode: "pose-snapshot",
            frameIndex,
            mediaTimeMs: frame.timestamp.mediaTimeMs,
            snapshot: this.options.applyPoseSnapshot(poseSnapshot, {
                frameIndex,
                mediaTimeMs: frame.timestamp.mediaTimeMs,
                frame,
            }),
        });
    }

    private applyFinalPoseFrame(
        frame: SincroMotionDebugFrame,
        frameIndex: number,
    ): MotionReplayFrameResult<TSnapshot> {
        if (frame.finalPose === undefined) {
            return this.setLastResult({
                ok: false,
                mode: "final-pose-playback",
                frameIndex,
                code: "missing_final_pose",
                message: "Motion replay frame is missing frame.finalPose.",
            });
        }

        return this.setLastResult({
            ok: true,
            mode: "final-pose-playback",
            frameIndex,
            mediaTimeMs: frame.timestamp.mediaTimeMs,
            snapshot:
                this.options.previewFinalPose?.(frame.finalPose, {
                    frameIndex,
                    mediaTimeMs: frame.timestamp.mediaTimeMs,
                    frame,
                }) ?? this.options.readSnapshot(),
        });
    }

    private parsePoseSnapshot(value: unknown): SincroPoseMotionSnapshot | undefined {
        return parseReplayPoseSnapshot(value);
    }

    private setLastResult(
        result: MotionReplayFrameResult<TSnapshot>,
    ): MotionReplayFrameResult<TSnapshot> {
        this.state = {
            ...this.state,
            status: result.ok ? this.state.status : "error",
            currentFrameIndex: result.frameIndex,
            lastResult: result,
        };
        return result;
    }
}

function formatRawParseSlots(errors: readonly MotionReplayRawResultParseError[]): string {
    const slots = errors
        .map((error) => error.slot)
        .filter((slot, index, all) => all.indexOf(slot) === index);
    return slots.length === 0 ? "root" : slots.join(", ");
}
