/**
 * motion-debug recording Blob を user download として発火する DOM 境界。
 * Object URL はこの helper が revoke し、recording schema や compression policy は recorder 側に残す。
 */
import type { MotionDebugRecorderBlobResult } from "../../character/motionEvaluation/motionDebugRecorder";

export type MotionDebugRecordingDownloadSuccess = {
    ok: true;
    fileName: string;
    mimeType: string;
    byteLength: number;
};

export function downloadMotionDebugRecording(
    result: Extract<MotionDebugRecorderBlobResult, { ok: true }>,
): MotionDebugRecordingDownloadSuccess {
    const fileName = `sincro-motion-debug-${createIsoFileStamp()}${result.fileExtension}`;
    const objectUrl = URL.createObjectURL(result.blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.rel = "noopener";
    anchor.click();
    window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
    }, 0);
    return {
        ok: true,
        fileName,
        mimeType: result.mimeType,
        byteLength: result.blob.size,
    };
}

function createIsoFileStamp(): string {
    return new Date().toISOString().replace(/[:.]/g, "-");
}
