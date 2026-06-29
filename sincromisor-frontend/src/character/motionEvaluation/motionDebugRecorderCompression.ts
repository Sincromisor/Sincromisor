/**
 * motion-debug NDJSON を download 用 Blob へ変換する compression 境界。
 *
 * 圧縮方式は transport だけの違いであり、NDJSON schemaVersion、frame 内容、manifest は変更しない。
 * browser の CompressionStream 非対応や圧縮失敗は非圧縮 Blob の fallbackReason として返す。
 */
import type {
    MotionDebugCompressedBlob,
    MotionDebugRecorderCompression,
} from "./motionDebugRecorderTypes";

const NDJSON_MIME_TYPE = "application/x-ndjson";
const GZIP_MIME_TYPE = "application/gzip";

/**
 * requested compression に応じて NDJSON Blob または gzip Blob を作成する。
 *
 * `brotli` は現行 browser API でサポートしないため、例外ではなく非圧縮 fallback を返す。gzip 中の例外も
 * caller の recording 完了を失敗させず、`fallbackReason` で UI / impl log が観測できる形にする。
 */
export async function createMotionDebugRecordingBlob(
    ndjson: string,
    requestedCompression: MotionDebugRecorderCompression,
): Promise<MotionDebugCompressedBlob> {
    if (requestedCompression === "none") {
        return createPlainBlob(ndjson);
    }
    if (requestedCompression === "brotli") {
        return createFallbackBlob(ndjson, "brotli_compression_not_supported");
    }
    if (globalThis.CompressionStream === undefined) {
        return createFallbackBlob(ndjson, "compression_stream_not_supported");
    }

    try {
        const sourceBlob = new Blob([ndjson], { type: NDJSON_MIME_TYPE });
        const compressedStream = sourceBlob.stream().pipeThrough(new CompressionStream("gzip"));
        const blob = await new Response(compressedStream).blob();
        return {
            blob,
            compression: "gzip",
            fileExtension: ".ndjson.gz",
            mimeType: GZIP_MIME_TYPE,
        };
    } catch (error) {
        return createFallbackBlob(ndjson, `compression_failed: ${formatError(error)}`);
    }
}

function createPlainBlob(ndjson: string): MotionDebugCompressedBlob {
    return {
        blob: new Blob([ndjson], { type: NDJSON_MIME_TYPE }),
        compression: "none",
        fileExtension: ".ndjson",
        mimeType: NDJSON_MIME_TYPE,
    };
}

function createFallbackBlob(ndjson: string, reason: string): MotionDebugCompressedBlob {
    return {
        ...createPlainBlob(ndjson),
        fallbackReason: reason,
    };
}

function formatError(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
