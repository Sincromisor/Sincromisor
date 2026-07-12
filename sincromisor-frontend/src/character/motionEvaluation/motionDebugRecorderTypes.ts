/**
 * motion-debug recorder の config、state、manifest / frame input、Blob result の型境界。
 * 圧縮方式は出力 transport の違いだけを表し、NDJSON schemaVersion や frame shape はここでは変えない。
 */
import type { SincroMotionDebugFrame, SincroMotionDebugLogManifest } from "./motionDebugLogSchema";

export type MotionDebugRecorderCompression = "none" | "gzip" | "brotli";

export type MotionDebugRecorderConfig = {
    maxDurationMs: number;
    maxFrames: number;
    compression: MotionDebugRecorderCompression;
};

export type MotionDebugRecorderState = {
    status: "idle" | "recording" | "stopped" | "exporting" | "error";
    frameCount: number;
    startedAtIso?: string;
    durationMs: number;
    stopReason?: "user" | "max_duration" | "max_frames" | "source_stopped" | "error";
    compression: MotionDebugRecorderCompression;
    compressionFallbackReason?: string;
    lastError?: string;
};

export type MotionDebugRecorderResult =
    | { ok: true; state: MotionDebugRecorderState }
    | {
          ok: false;
          code:
              | "source_not_ready"
              | "already_recording"
              | "not_recording"
              | "no_frames"
              | "export_failed";
          message: string;
          state: MotionDebugRecorderState;
      };

export type MotionDebugRecorderManifestInput = SincroMotionDebugLogManifest;

export type MotionDebugRecorderFrameInput = Omit<SincroMotionDebugFrame, "frameIndex"> & {
    dedupeKey: {
        mediaTimeMs: number;
        poseLastUpdatedAtMs?: number | null;
        presentedFrames?: number;
    };
};

export type MotionDebugRecorderRecordFrameResult =
    | {
          ok: true;
          recorded: true;
          frameIndex: number;
          state: MotionDebugRecorderState;
      }
    | {
          ok: true;
          recorded: false;
          skippedReason: "duplicate_frame";
          state: MotionDebugRecorderState;
      }
    | {
          ok: false;
          code: "not_recording" | "invalid_frame" | "max_duration" | "max_frames";
          message: string;
          state: MotionDebugRecorderState;
      };

export type MotionDebugRecorderNdjsonResult =
    | { ok: true; ndjson: string; state: MotionDebugRecorderState }
    | {
          ok: false;
          code: "not_stopped" | "no_frames" | "export_failed";
          message: string;
          state: MotionDebugRecorderState;
      };

export type MotionDebugRecorderBlobResult =
    | {
          ok: true;
          blob: Blob;
          compression: MotionDebugRecorderCompression;
          fileExtension: ".ndjson" | ".ndjson.gz" | ".ndjson.br";
          mimeType: string;
          state: MotionDebugRecorderState;
      }
    | {
          ok: false;
          code: "not_stopped" | "no_frames" | "export_failed";
          message: string;
          state: MotionDebugRecorderState;
      };

export type MotionDebugCompressedBlob = {
    blob: Blob;
    compression: MotionDebugRecorderCompression;
    fileExtension: ".ndjson" | ".ndjson.gz" | ".ndjson.br";
    mimeType: string;
    fallbackReason?: string;
};
