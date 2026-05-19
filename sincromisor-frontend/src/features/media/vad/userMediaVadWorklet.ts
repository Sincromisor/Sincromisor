import type { VadStateReport } from "../userMedia/userMediaTypes";

export type VadWorkletMessage = {
    type?: string;
    pcm?: unknown;
    sampleRate?: unknown;
    rms?: unknown;
    peak?: unknown;
    isSpeech?: unknown;
};

export function normalizePcmFrame(raw: unknown): Float32Array | undefined {
    if (raw instanceof Float32Array) {
        return raw;
    }
    if (raw instanceof ArrayBuffer) {
        return new Float32Array(raw);
    }
    if (ArrayBuffer.isView(raw)) {
        const view = raw;
        return new Float32Array(
            view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength),
        );
    }
    if (Array.isArray(raw)) {
        const values = raw.map((value) => Number(value));
        if (values.some((value) => !Number.isFinite(value))) {
            return undefined;
        }
        return Float32Array.from(values);
    }
    return undefined;
}

export function positiveNumberOrDefault(value: unknown, defaultValue: number): number {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : defaultValue;
}

export function vadReportFromWorkletMessage(data: VadWorkletMessage): VadStateReport {
    return {
        isSpeech: !!data.isSpeech,
        rms: nonNegativeNumberOrZero(data.rms),
        peak: nonNegativeNumberOrZero(data.peak),
    };
}

function nonNegativeNumberOrZero(value: unknown): number {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0;
}
