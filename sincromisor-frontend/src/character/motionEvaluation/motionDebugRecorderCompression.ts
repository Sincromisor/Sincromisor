import type {
    MotionDebugCompressedBlob,
    MotionDebugRecorderCompression,
} from "./motionDebugRecorderTypes";

const NDJSON_MIME_TYPE = "application/x-ndjson";
const GZIP_MIME_TYPE = "application/gzip";

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
